import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDeploy } from "../src/deploy";
import { memoryLogger } from "../src/log";
import type { Runner } from "../src/runner";
import { editConfig, editSite, makeFixtureRepo } from "./fixture";

let fixture: ReturnType<typeof makeFixtureRepo>;
beforeEach(() => {
  fixture = makeFixtureRepo();
  editConfig(fixture.root, "cloudflare.json", (config) => {
    (config.secretsStore as { storeId: string }).storeId = "0123456789abcdef0123456789abcdef";
  });
  editSite(fixture.root, "pocatello", (site) => {
    site.canary = true;
  });
});
afterEach(() => fixture.cleanup());

type Call = { tool: "astro" | "wrangler"; args: string[]; site: string };

/** Fakes both `astro build` and `wrangler deploy`. `script` maps a Worker name to per-attempt outcomes. */
function fakeTools(root: string, script: Record<string, ("ok" | "429" | "fail")[]> = {}): Runner & { calls: Call[] } {
  const calls: Call[] = [];
  const attempts = new Map<string, number>();
  const runner: Runner = async (command, args, options) => {
    if (command.endsWith("/astro")) {
      const site = options?.env?.SITE ?? "?";
      calls.push({ tool: "astro", args, site });
      mkdirSync(join(root, "dist", site), { recursive: true });
      writeFileSync(join(root, "dist", site, "index.html"), "<html></html>");
      return { code: 0, stdout: "", stderr: "" };
    }
    const configPath = args[args.indexOf("--config") + 1] ?? "";
    const worker = JSON.parse(readFileSync(configPath, "utf8").replace(/^\/\/.*\n/, "")).name as string;
    calls.push({ tool: "wrangler", args, site: worker });
    const n = (attempts.get(worker) ?? 0) + 1;
    attempts.set(worker, n);
    const outcome = script[worker]?.[n - 1] ?? "ok";
    if (outcome === "429") return { code: 1, stdout: "", stderr: "APIError: A request to the Cloudflare API failed. [code: 10000] 429 Too Many Requests" };
    if (outcome === "fail") return { code: 1, stdout: "", stderr: "✘ [ERROR] Authentication error [code: 10000]" };
    return { code: 0, stdout: `Deployed ${worker} triggers`, stderr: "" };
  };
  return Object.assign(runner, { calls });
}

const okChecks = async (items: { ref: { niche: string; id: string; nicheDir: string; siteDir: string }; domain: string }[]) =>
  items.map((item) => ({ ref: item.ref, domain: item.domain, ok: true, checks: [{ name: "root", ok: true, detail: "200" }] }));

describe("runDeploy", () => {
  it("dry-run prints the plan, builds, and never calls wrangler", async () => {
    const runner = fakeTools(fixture.root);
    const logger = memoryLogger();
    const result = await runDeploy(fixture.root, "all", { logger, runner });
    expect(result.ok).toBe(true);
    expect(runner.calls.filter((call) => call.tool === "wrangler")).toHaveLength(0);
    expect(runner.calls.filter((call) => call.tool === "astro")).toHaveLength(3);
    const text = logger.lines.join("\n");
    expect(text).toContain("Deploy plan (dry-run; pass --apply to deploy):");
    expect(text).toContain("canaries (1): asphalt-paving/pocatello");
    expect(text).toContain("then (2): asphalt-paving/blackfoot, asphalt-paving/st-george");
    expect(text).toContain("wrangler deploy --config niches/asphalt-paving/sites/pocatello/wrangler.jsonc   # asphalt-paving-pocatello -> https://pocatelloasphaltpaving.com");
  });

  it("apply deploys canaries first, checks them, then the rest in batches, and writes a summary", async () => {
    const runner = fakeTools(fixture.root);
    const logger = memoryLogger();
    const checked: string[] = [];
    const result = await runDeploy(fixture.root, "all", {
      logger,
      runner,
      apply: true,
      concurrency: 2,
      domainsCheck: async (items) => {
        checked.push(...items.map((item) => item.domain));
        return okChecks(items);
      },
    });
    expect(result.ok).toBe(true);
    const deploys = runner.calls.filter((call) => call.tool === "wrangler").map((call) => call.site);
    expect(deploys).toEqual(["asphalt-paving-pocatello", "asphalt-paving-blackfoot", "asphalt-paving-st-george"]);
    expect(checked).toEqual(["pocatelloasphaltpaving.com"]);
    expect(logger.lines).toContain("Deploy summary: 3 succeeded, 0 failed, 0 not attempted");
    expect(existsSync(join(fixture.root, ".cache/deploy/failed.json"))).toBe(false);
  });

  it("stops after the canary when its domain checks fail and records the rest for --retry-failed", async () => {
    const runner = fakeTools(fixture.root);
    const logger = memoryLogger();
    await expect(
      runDeploy(fixture.root, "all", {
        logger,
        runner,
        apply: true,
        domainsCheck: async (items) => items.map((item) => ({ ref: item.ref, domain: item.domain, ok: false, checks: [{ name: "www", ok: false, detail: "GET https://www.x/ -> 404" }] })),
      }),
    ).rejects.toThrow(/canary domain checks failed/);
    expect(runner.calls.filter((call) => call.tool === "wrangler").map((call) => call.site)).toEqual(["asphalt-paving-pocatello"]);
    const failed = JSON.parse(readFileSync(join(fixture.root, ".cache/deploy/failed.json"), "utf8"));
    expect(failed.sites).toEqual(["asphalt-paving/blackfoot", "asphalt-paving/st-george"]);

    const retry = await runDeploy(fixture.root, undefined, { logger, runner, apply: true, retryFailed: true, domainsCheck: okChecks });
    expect(retry.ok).toBe(true);
    expect(runner.calls.filter((call) => call.tool === "wrangler").map((call) => call.site).slice(1)).toEqual(["asphalt-paving-blackfoot", "asphalt-paving-st-george"]);
  });

  it("backs off on 429 and retries, and reports hard failures without stopping the batch", async () => {
    const runner = fakeTools(fixture.root, { "asphalt-paving-blackfoot": ["429", "ok"], "asphalt-paving-st-george": ["fail"] });
    const logger = memoryLogger();
    const sleeps: number[] = [];
    const result = await runDeploy(fixture.root, "all", {
      logger,
      runner,
      apply: true,
      domainsCheck: okChecks,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result.ok).toBe(false);
    expect(sleeps).toEqual([60_000]);
    expect(result.results.find((entry) => entry.ref.id === "blackfoot")).toMatchObject({ ok: true, attempts: 2 });
    expect(result.results.find((entry) => entry.ref.id === "st-george")).toMatchObject({ ok: false, attempts: 1 });
    expect(logger.lines).toContain("Deploy summary: 2 succeeded, 1 failed, 0 not attempted");
    expect(logger.lines.join("\n")).toMatch(/warning: asphalt-paving\/blackfoot: Cloudflare rate limit hit; pausing all deploys for 60s/);
    expect(JSON.parse(readFileSync(join(fixture.root, ".cache/deploy/failed.json"), "utf8")).sites).toEqual(["asphalt-paving/st-george"]);
  });

  it("refuses to apply while the Secrets Store id is a TODO and when check fails", async () => {
    editConfig(fixture.root, "cloudflare.json", (config) => {
      (config.secretsStore as { storeId: string }).storeId = "TODO_SECRETS_STORE_ID";
    });
    await expect(runDeploy(fixture.root, "all", { logger: memoryLogger(), runner: fakeTools(fixture.root), apply: true })).rejects.toThrow(/storeId is still a TODO/);
    editSite(fixture.root, "blackfoot", (site) => {
      site.domain = "www.asphaltpavingblackfoot.com";
    });
    await expect(runDeploy(fixture.root, "all", { logger: memoryLogger(), runner: fakeTools(fixture.root) })).rejects.toThrow(/check failed/);
  });
});
