import { loadCloudflareConfig, loadSite } from "@lead-gen/engine/load";
import { runBatched } from "./batch";
import { loadFailures, saveFailures } from "./failures";
import { CliError, type Logger } from "./log";
import { looksRateLimited, spawnRunner, tail, type Runner } from "./runner";
import { refKey, resolveTargets, type SiteRef } from "./targets";
import { wranglerBin } from "./deploy";

export type RotateOptions = {
  /** The new secret value, read from stdin by the CLI. Never logged. */
  value: string;
  apply?: boolean;
  target?: string;
  concurrency?: number;
  retryFailed?: boolean;
  logger: Logger;
  runner?: Runner;
  sleep?: (ms: number) => Promise<void>;
};

export type RotateResult = { ref: SiteRef; worker: string; ok: boolean; attempts: number; message?: string };

const secretName = /^[A-Z][A-Z0-9_]*$/;

/**
 * Fallback for when the Secrets Store cannot be used: sets NAME as a regular Worker secret on every
 * site Worker with `wrangler secret put`, in rate-limit-aware batches. Dry-run unless `apply`.
 * Each put creates and deploys a new version of that Worker.
 */
export async function runSecretsRotate(root: string, name: string, options: RotateOptions): Promise<{ ok: boolean; results: RotateResult[] }> {
  const { logger } = options;
  if (!secretName.test(name)) throw new CliError(`secret name "${name}" must be UPPER_SNAKE_CASE`);
  const value = options.value.replace(/\r?\n$/, "");
  if (!value.trim()) throw new CliError("no secret value: pipe it on stdin, e.g. `pbpaste | pnpm secrets rotate TRACER_FORM_KEY --apply`");
  const runner = options.runner ?? spawnRunner;
  const cloudflare = loadCloudflareConfig(root);
  const concurrency = options.concurrency ?? cloudflare.deploy.concurrency;

  const refs = options.retryFailed ? loadFailures(root, "secrets") : resolveTargets(root, options.target);
  if (refs.length === 0) throw new CliError("no sites match the target");
  const workers = refs.map((ref) => ({ ref, worker: loadSite(ref.nicheDir, ref.id).site.cloudflareProject }));

  logger.log(options.apply ? `Rotating ${name} on ${workers.length} Workers:` : `Rotate plan for ${name} (dry-run; pass --apply to set it):`);
  logger.log(`  concurrency: ${concurrency}; value: ${value.length} characters (never printed)`);
  for (const item of workers) logger.log(`  wrangler secret put ${name} --name ${item.worker} < (stdin)   # ${refKey(item.ref)}`);
  if (!options.apply) {
    return { ok: true, results: workers.map((item) => ({ ...item, ok: true, attempts: 0, message: "dry-run" })) };
  }

  const batch = await runBatched(
    workers,
    async (item) => {
      const result = await runner(wranglerBin(root), ["secret", "put", name, "--name", item.worker], { cwd: root, input: `${value}\n` });
      if (result.code === 0) return { ok: true };
      const text = `${result.stderr}\n${result.stdout}`.split(value).join("[redacted]");
      return { ok: false, rateLimited: looksRateLimited(text), message: `exit ${result.code}:\n${tail(text, 8)}` };
    },
    {
      concurrency,
      sleep: options.sleep,
      onEvent: (event) => {
        if (event.type === "start") logger.log(`put     ${event.item.worker} (attempt ${event.attempt})`);
        if (event.type === "rate-limited") logger.warn(`${event.item.worker}: Cloudflare rate limit hit; pausing for ${Math.round(event.delayMs / 1000)}s`);
        if (event.type === "done" && event.ok) logger.log(`done    ${event.item.worker}`);
      },
    },
  );

  const results: RotateResult[] = batch.map((entry) => ({ ...entry.item, ok: entry.ok, attempts: entry.attempts, message: entry.message }));
  const failed = results.filter((result) => !result.ok);
  saveFailures(root, "secrets", failed.map((result) => result.ref));
  logger.log("");
  logger.log(`Rotate summary: ${results.length - failed.length} succeeded, ${failed.length} failed`);
  for (const result of failed) logger.log(`  FAIL  ${result.worker}: ${result.message ?? "unknown error"}`);
  if (failed.length > 0) logger.log(`Re-run only the failures with: pnpm secrets rotate ${name} --retry-failed --apply`);
  return { ok: failed.length === 0, results };
}
