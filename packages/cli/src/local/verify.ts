import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCloudflareConfig, loadSite } from "@lead-gen/engine/load";
import { runBuild } from "../build";
import { wranglerBin } from "../deploy";
import { CliError, type Logger } from "../log";
import { spawnRunner, tail, type Runner } from "../runner";
import { refKey, resolveTargets, type SiteRef } from "../targets";
import { wranglerConfigPath } from "../wrangler-config";
import { startMockTracer, type MockTracer } from "./mock-tracer";

export type VerifyCheck = { name: string; ok: boolean; detail: string };
export type VerifyResult = { ref: SiteRef; ok: boolean; checks: VerifyCheck[] };

export type VerifyOptions = {
  logger: Logger;
  basePort?: number;
  runner?: Runner;
  skipBuild?: boolean;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitForReady(url: string, child: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited with ${child.exitCode}`);
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`wrangler dev did not answer on ${url} within ${timeoutMs / 1000}s`);
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || !child.pid) return resolve();
    child.once("exit", () => resolve());
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
      resolve();
    }, 5000).unref();
  });
}

type LeadForm = Record<string, string>;

async function postLead(base: string, form: LeadForm, page = "/contact/") {
  const response = await fetch(`${base}/api/lead`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: base, referer: `${base}${page}` },
    body: new URLSearchParams(form),
  });
  return { status: response.status, location: new URL(response.headers.get("location") ?? "/", base).pathname + new URL(response.headers.get("location") ?? "/", base).search + new URL(response.headers.get("location") ?? "/", base).hash };
}

/**
 * Runs each site under `wrangler dev` exactly as it would deploy (same generated wrangler.jsonc),
 * with TRACER_FORMS_URL pointed at a local mock Tracer through .dev.vars and TRACER_FORM_KEY held
 * in a local Secrets Store. Nothing here talks to Cloudflare or the real Tracer.
 */
export async function runVerifyLocal(root: string, target: string | undefined, options: VerifyOptions): Promise<VerifyResult[]> {
  const { logger } = options;
  const runner = options.runner ?? spawnRunner;
  const refs = resolveTargets(root, target);
  if (refs.length === 0) throw new CliError("no sites match the target");
  const cloudflare = loadCloudflareConfig(root);

  if (!options.skipBuild) {
    const built = await runBuild(root, target, { logger, runner });
    if (built.some((result) => result.status === "failed")) throw new CliError("build failed");
  }

  const formKey = `local-test-${randomUUID()}`;
  const persist = mkdtempSync(join(tmpdir(), "lead-gen-verify-"));
  const tracer: MockTracer = await startMockTracer(formKey);
  logger.log(`mock Tracer on ${tracer.url}; local Secrets Store in ${persist} (test key, never a real one)`);

  const results: VerifyResult[] = [];
  try {
    const created = await runner(
      wranglerBin(root),
      ["secrets-store", "secret", "create", cloudflare.secretsStore.storeId, "--name", cloudflare.secretsStore.secretName, "--scopes", "workers", "--value", formKey, "--persist-to", persist],
      { cwd: root },
    );
    if (created.code !== 0) throw new CliError(`could not create the local Secrets Store secret:\n${tail(created.stderr || created.stdout)}`);

    let port = options.basePort ?? 8801;
    for (const ref of refs) {
      results.push(await verifySite(root, ref, port++, persist, tracer, logger));
    }
  } finally {
    await tracer.close();
    rmSync(persist, { recursive: true, force: true });
  }

  const failed = results.filter((result) => !result.ok);
  logger.log("");
  logger.log(`verify-local summary: ${results.length - failed.length} passed, ${failed.length} failed`);
  return results;
}

async function verifySite(root: string, ref: SiteRef, port: number, persist: string, tracer: MockTracer, logger: Logger): Promise<VerifyResult> {
  const { site, services } = loadSite(ref.nicheDir, ref.id);
  const devVars = join(ref.siteDir, ".dev.vars");
  if (existsSync(devVars)) throw new CliError(`${devVars} already exists; move it aside so verify-local can write its own`);
  writeFileSync(devVars, `# Written by pnpm verify-local; removed when it finishes.\nTRACER_FORMS_URL="${tracer.url}"\n`);
  const base = `http://127.0.0.1:${port}`;
  const checks: VerifyCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  logger.log("");
  logger.log(`${refKey(ref)}: wrangler dev on ${base}`);
  const child = spawn(
    wranglerBin(root),
    ["dev", "--config", wranglerConfigPath(ref), "--ip", "127.0.0.1", "--port", String(port), "--persist-to", persist, "--show-interactive-dev-session=false", "--log-level", "warn"],
    { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

  try {
    await waitForReady(`${base}/`, child);

    const pages = ["/", "/about/", "/contact/", "/thank-you/", "/robots.txt", "/sitemap-index.xml", ...services.map((service) => `/services/${service.slug}/`)];
    for (const path of pages) {
      const response = await fetch(`${base}${path}`, { redirect: "manual" });
      const text = await response.text();
      const ok = response.status === 200 && (path.endsWith(".txt") || path.endsWith(".xml") || text.includes(site.business.name));
      add(`GET ${path}`, ok, `${response.status}${ok ? "" : " (missing business name or wrong status)"}`);
    }
    const missing = await fetch(`${base}/no-such-page/`, { redirect: "manual" });
    add("GET /no-such-page/", missing.status === 404, String(missing.status));

    const canonical = await (await fetch(`${base}/`)).text();
    add("canonical uses domain", canonical.includes(`<link rel="canonical" href="https://${site.domain}/">`), `https://${site.domain}/`);

    const service = site.serviceOptions[0] ?? "Other";
    const good = { name: "Local Verify", phone: "(208) 555-0100", email: "verify@example.com", size: "1200", service };

    const before = tracer.received.length;
    let response = await postLead(base, good, "/services/");
    const lead = tracer.received.slice(before);
    const body = lead[0]?.body as { site?: string; page?: string; fields?: Record<string, string> } | undefined;
    add("lead -> /thank-you", response.status === 303 && response.location === "/thank-you", `${response.status} ${response.location}`);
    add("Tracer got one lead", lead.length === 1, `${lead.length} request(s)`);
    add("bearer key from Secrets Store", lead[0]?.authorized === true, lead[0]?.authorized ? "matches local test key" : "missing or wrong");
    add("body matches contract", lead[0]?.valid === true, lead[0]?.problems.join("; ") || "ok");
    add("site is the hostname", body?.site === site.hostname, String(body?.site));
    add("page from referer", body?.page === "/services/", String(body?.page));
    add("size formatted", body?.fields?.["Approx. size"] === "1,200 sq ft", String(body?.fields?.["Approx. size"]));

    let count = tracer.received.length;
    response = await postLead(base, { ...good, email: "not-an-email" });
    add("invalid -> field error", response.status === 303 && response.location === "/contact/?error=1#error-fields" && tracer.received.length === count, `${response.status} ${response.location}`);

    response = await postLead(base, { ...good, company_website: "https://spam.example" });
    add("honeypot -> thank-you, not sent", response.status === 303 && response.location === "/thank-you" && tracer.received.length === count, `${response.status} ${response.location}, Tracer calls +${tracer.received.length - count}`);

    tracer.respondWith = 500;
    count = tracer.received.length;
    response = await postLead(base, good);
    tracer.respondWith = 200;
    add("Tracer 500 -> send error", response.status === 303 && response.location === "/contact/?error=send#error-send" && tracer.received.length === count + 1, `${response.status} ${response.location}`);
  } catch (error) {
    add("wrangler dev", false, `${(error as Error).message}\n${tail(output, 15)}`);
  } finally {
    await stop(child);
    rmSync(devVars, { force: true });
  }

  const ok = checks.every((check) => check.ok);
  for (const check of checks) (check.ok ? logger.log : logger.error)(`  ${check.ok ? "ok  " : "FAIL"} ${check.name}: ${check.detail}`);
  return { ref, ok, checks };
}
