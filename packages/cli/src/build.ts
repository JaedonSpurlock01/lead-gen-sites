import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCloudflareConfig, loadEnvironments, loadSite } from "@lead-gen/engine/load";
import { runBatched } from "./batch";
import { siteInputHash } from "./hash";
import { CliError, type Logger } from "./log";
import { spawnRunner, tail, type Runner } from "./runner";
import { refKey, resolveTargets, type SiteRef } from "./targets";
import { writeWranglerConfig } from "./wrangler-config";

export type BuildOptions = {
  force?: boolean;
  concurrency?: number;
  /** Tracer environment name from config/environments.json; defaults to its `default`. */
  env?: string;
  logger: Logger;
  runner?: Runner;
};

export type BuildResult = {
  ref: SiteRef;
  status: "built" | "skipped" | "failed";
  hash: string;
  wranglerConfig: string;
  message?: string;
};

export function resolveTracerFormsUrl(root: string, env?: string): { name: string; tracerFormsUrl: string } {
  const environments = loadEnvironments(root);
  const name = env ?? environments.default;
  const entry = environments.environments[name];
  if (!entry) throw new CliError(`unknown environment "${name}"; config/environments.json has ${Object.keys(environments.environments).join(", ")}`);
  return { name, tracerFormsUrl: entry.tracerFormsUrl };
}

const cachePath = (root: string, ref: SiteRef) => join(root, ".cache", "build", `${ref.id}.json`);

/** Writes every targeted site's wrangler.jsonc and builds the ones whose input hash changed. */
export async function runBuild(root: string, target: string | undefined, options: BuildOptions): Promise<BuildResult[]> {
  const { logger } = options;
  const runner = options.runner ?? spawnRunner;
  const refs = resolveTargets(root, target);
  const cloudflare = loadCloudflareConfig(root);
  const environment = resolveTracerFormsUrl(root, options.env);
  logger.log(`environment: ${environment.name} (TRACER_FORMS_URL ${environment.tracerFormsUrl})`);

  const results = await runBatched(
    refs,
    async (ref): Promise<{ ok: boolean; message?: string }> => {
      const loaded = loadSite(ref.nicheDir, ref.id);
      const wranglerConfig = writeWranglerConfig({ root, ref, site: loaded.site, cloudflare, tracerFormsUrl: environment.tracerFormsUrl });
      const hash = siteInputHash(root, ref);
      const cache = cachePath(root, ref);
      const distDir = join(root, "dist", ref.id);
      const previous = existsSync(cache) ? (JSON.parse(readFileSync(cache, "utf8")) as { hash?: string }).hash : undefined;
      if (!options.force && previous === hash && existsSync(join(distDir, "index.html"))) {
        logger.log(`skip    ${refKey(ref)} (inputs unchanged)`);
        return { ok: true, message: `skipped\0${hash}\0${wranglerConfig}` };
      }
      logger.log(`build   ${refKey(ref)} -> dist/${ref.id}/`);
      const astro = join(ref.nicheDir, "node_modules", ".bin", "astro");
      const result = await runner(astro, ["build"], { cwd: ref.nicheDir, env: { ...process.env, SITE: ref.id } });
      if (result.code !== 0) {
        return { ok: false, message: `astro build failed (exit ${result.code}):\n${tail(result.stderr || result.stdout, 12)}` };
      }
      mkdirSync(join(root, ".cache", "build"), { recursive: true });
      writeFileSync(cache, `${JSON.stringify({ hash, builtAt: new Date().toISOString() }, null, 2)}\n`);
      logger.log(`built   ${refKey(ref)}`);
      return { ok: true, message: `built\0${hash}\0${wranglerConfig}` };
    },
    { concurrency: options.concurrency ?? 2, maxAttempts: 1 },
  );

  const out: BuildResult[] = results.map((result) => {
    if (!result.ok) {
      logger.error(`${refKey(result.item)}: ${result.message ?? "build failed"}`);
      return { ref: result.item, status: "failed", hash: "", wranglerConfig: "", message: result.message };
    }
    const [status, hash, wranglerConfig] = (result.message ?? "").split("\0") as ["built" | "skipped", string, string];
    return { ref: result.item, status, hash, wranglerConfig };
  });
  const counts = { built: 0, skipped: 0, failed: 0 };
  for (const result of out) counts[result.status] += 1;
  logger.log(`build summary: ${counts.built} built, ${counts.skipped} skipped, ${counts.failed} failed`);
  return out;
}
