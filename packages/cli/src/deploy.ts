import { join, relative } from "node:path";
import { loadCloudflareConfig, loadSite } from "@lead-gen/engine/load";
import { runBatched } from "./batch";
import { runBuild, resolveTracerFormsUrl } from "./build";
import { runCheck } from "./check";
import { type DomainCheckResult } from "./domains/http-checks";
import { createCloudflareApi, credentialsFromEnv, throttled } from "./domains/api";
import { checkOne } from "./domains/check";
import { loadFailures, saveFailures } from "./failures";
import { CliError, type Logger } from "./log";
import { looksRateLimited, spawnRunner, tail, type Runner } from "./runner";
import { refKey, resolveTargets, type SiteRef } from "./targets";
import { wranglerConfigPath } from "./wrangler-config";

export type DeployOptions = {
  /** Without this the command only prints the plan. */
  apply?: boolean;
  concurrency?: number;
  retryFailed?: boolean;
  skipBuild?: boolean;
  env?: string;
  logger: Logger;
  runner?: Runner;
  sleep?: (ms: number) => Promise<void>;
  /** Canary verification; defaults to the read-only HTTP checks. */
  domainsCheck?: (refs: { ref: SiteRef; domain: string }[]) => Promise<DomainCheckResult[]>;
};

export type DeployResult = { ref: SiteRef; ok: boolean; attempts: number; message?: string };

type Planned = { ref: SiteRef; domain: string; worker: string; canary: boolean };

export function wranglerBin(root: string): string {
  return join(root, "node_modules", ".bin", "wrangler");
}

/**
 * Deploys one site, a niche, or everything: check -> build -> canaries -> canary domain checks ->
 * the rest in rate-limit-aware batches -> summary. Dry-run unless `apply`.
 */
export async function runDeploy(root: string, target: string | undefined, options: DeployOptions): Promise<{ ok: boolean; results: DeployResult[] }> {
  const { logger } = options;
  const runner = options.runner ?? spawnRunner;
  const cloudflare = loadCloudflareConfig(root);
  const concurrency = options.concurrency ?? cloudflare.deploy.concurrency;
  const environment = resolveTracerFormsUrl(root, options.env);

  const refs = options.retryFailed ? loadFailures(root, "deploy") : resolveTargets(root, target);
  if (refs.length === 0) throw new CliError(`nothing to deploy for target "${target ?? "all"}"`);

  const check = runCheck(root, options.retryFailed ? "all" : target, logger);
  if (!check.ok) throw new CliError("check failed; fix the errors above before deploying");

  const planned: Planned[] = refs.map((ref) => {
    const { site } = loadSite(ref.nicheDir, ref.id);
    return { ref, domain: site.domain, worker: site.cloudflareProject, canary: site.canary };
  });
  const canaries = planned.filter((item) => item.canary);
  const rest = planned.filter((item) => !item.canary);
  const command = (item: Planned) => `wrangler deploy --config ${relative(root, wranglerConfigPath(item.ref))}`;

  logger.log("");
  logger.log(options.apply ? "Deploy plan:" : "Deploy plan (dry-run; pass --apply to deploy):");
  logger.log(`  environment: ${environment.name} (TRACER_FORMS_URL ${environment.tracerFormsUrl})`);
  logger.log(`  concurrency: ${concurrency}; backoff on 429 starts at 60s and doubles (Cloudflare allows 1,200 API requests per 5 minutes per token)`);
  logger.log(`  canaries (${canaries.length}): ${canaries.map((item) => refKey(item.ref)).join(", ") || "none"}`);
  logger.log(`  then (${rest.length}): ${rest.map((item) => refKey(item.ref)).join(", ") || "none"}`);
  for (const item of [...canaries, ...rest]) {
    logger.log(`  ${command(item)}   # ${item.worker} -> https://${item.domain}`);
  }
  if (!options.apply) {
    if (!options.skipBuild) {
      logger.log("");
      logger.log("Building so the wrangler.jsonc files exist (dry-run never uploads):");
      const built = await runBuild(root, options.retryFailed ? "all" : target, { logger, env: options.env, runner });
      if (built.some((result) => result.status === "failed")) throw new CliError("build failed");
    }
    return { ok: true, results: planned.map((item) => ({ ref: item.ref, ok: true, attempts: 0, message: "dry-run" })) };
  }

  if (/TODO/i.test(cloudflare.secretsStore.storeId)) {
    throw new CliError("config/cloudflare.json secretsStore.storeId is still a TODO; a Worker deployed with it would have no TRACER_FORM_KEY binding");
  }

  if (!options.skipBuild) {
    const built = await runBuild(root, options.retryFailed ? "all" : target, { logger, env: options.env, runner });
    const failed = built.filter((result) => result.status === "failed");
    if (failed.length > 0) throw new CliError(`build failed for ${failed.map((result) => refKey(result.ref)).join(", ")}`);
  }

  const deployOne = async (item: Planned) => {
    const result = await runner(wranglerBin(root), ["deploy", "--config", wranglerConfigPath(item.ref)], { cwd: root });
    if (result.code === 0) return { ok: true as const, message: tail(result.stdout, 1) };
    const text = `${result.stderr}\n${result.stdout}`;
    return { ok: false as const, rateLimited: looksRateLimited(text), message: `exit ${result.code}:\n${tail(text, 8)}` };
  };
  const batchOptions = {
    concurrency,
    sleep: options.sleep,
    onEvent: (event: { type: string; item: Planned; attempt: number; delayMs?: number; ok?: boolean }) => {
      if (event.type === "start") logger.log(`deploy  ${refKey(event.item.ref)} (attempt ${event.attempt})`);
      if (event.type === "rate-limited") logger.warn(`${refKey(event.item.ref)}: Cloudflare rate limit hit; pausing all deploys for ${Math.round((event.delayMs ?? 0) / 1000)}s`);
      if (event.type === "done" && event.ok) logger.log(`done    ${refKey(event.item.ref)}`);
    },
  };

  const results: DeployResult[] = [];
  const record = (batch: { item: Planned; ok: boolean; attempts: number; message?: string }[]) => {
    for (const entry of batch) results.push({ ref: entry.item.ref, ok: entry.ok, attempts: entry.attempts, message: entry.message });
  };

  if (canaries.length > 0) {
    logger.log("");
    logger.log(`Deploying ${canaries.length} canar${canaries.length === 1 ? "y" : "ies"} first`);
    record(await runBatched(canaries, deployOne, batchOptions));
    const canaryFailures = results.filter((result) => !result.ok);
    if (canaryFailures.length > 0) {
      saveFailures(root, "deploy", planned.map((item) => item.ref));
      summarize(logger, results, rest.map((item) => item.ref));
      throw new CliError("canary deploy failed; stopping before the remaining sites");
    }
    const domainsCheck = options.domainsCheck ?? defaultCanaryCheck(cloudflare);
    const checks = await domainsCheck(canaries.map((item) => ({ ref: item.ref, domain: item.domain })));
    for (const check of checks) {
      for (const line of check.checks) (line.ok ? logger.log : logger.warn)(`  ${check.ok ? "ok " : "FAIL"} ${refKey(check.ref)} ${line.name}: ${line.detail}`);
    }
    if (checks.some((check) => !check.ok)) {
      saveFailures(root, "deploy", rest.map((item) => item.ref));
      summarize(logger, results, rest.map((item) => item.ref));
      throw new CliError("canary domain checks failed; the remaining sites were not deployed (re-run with --retry-failed once fixed)");
    }
  }

  if (rest.length > 0) {
    logger.log("");
    logger.log(`Deploying ${rest.length} site${rest.length === 1 ? "" : "s"} in batches of ${concurrency}`);
    record(await runBatched(rest, deployOne, batchOptions));
  }

  const failed = results.filter((result) => !result.ok).map((result) => result.ref);
  saveFailures(root, "deploy", failed);
  summarize(logger, results, []);
  return { ok: failed.length === 0, results };
}

function summarize(logger: Logger, results: DeployResult[], notAttempted: SiteRef[]): void {
  const ok = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  logger.log("");
  logger.log(`Deploy summary: ${ok.length} succeeded, ${failed.length} failed, ${notAttempted.length} not attempted`);
  for (const result of ok) logger.log(`  ok    ${refKey(result.ref)}${result.attempts > 1 ? ` (after ${result.attempts} attempts)` : ""}`);
  for (const result of failed) logger.log(`  FAIL  ${refKey(result.ref)}: ${result.message ?? "unknown error"}`);
  for (const ref of notAttempted) logger.log(`  skip  ${refKey(ref)} (not attempted)`);
  if (failed.length > 0 || notAttempted.length > 0) logger.log("Re-run only the failures with: pnpm deploy --retry-failed --apply");
}

/** `domains check` on the canaries: API checks when credentials are present, HTTP checks always. */
function defaultCanaryCheck(cloudflare: ReturnType<typeof loadCloudflareConfig>) {
  const credentials = credentialsFromEnv();
  const api = credentials
    ? throttled(createCloudflareApi(credentials.token), { minIntervalMs: cloudflare.api.minIntervalMs, rateLimitPauseMs: cloudflare.api.rateLimitPauseMs })
    : null;
  return (items: { ref: SiteRef; domain: string }[]) => Promise.all(items.map((entry) => checkOne(entry.ref, { api, accountId: credentials?.accountId })));
}
