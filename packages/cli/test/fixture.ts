import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const realRoot = join(import.meta.dirname, "../../..");

/** A throwaway copy of the repo's data (config + the asphalt niche without code) to mutate in tests. */
export function makeFixtureRepo(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "lead-gen-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n  - niches/*\n");
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  mkdirSync(join(root, "packages"), { recursive: true });
  writeFileSync(join(root, "packages", "marker.txt"), "packages\n");
  cpSync(join(realRoot, "config"), join(root, "config"), { recursive: true });
  const niche = join(root, "niches", "asphalt-paving");
  mkdirSync(niche, { recursive: true });
  for (const name of ["niche.json", "copy", "assets", "sites"]) {
    cpSync(join(realRoot, "niches", "asphalt-paving", name), join(niche, name), { recursive: true });
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function readJson<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function editSite(root: string, id: string, edit: (site: Record<string, unknown> & { business: Record<string, string> }) => void): void {
  const path = join(root, "niches", "asphalt-paving", "sites", id, "site.json");
  const site = readJson<Record<string, unknown> & { business: Record<string, string> }>(path);
  edit(site);
  writeJson(path, site);
}

export function editConfig(root: string, name: string, edit: (config: Record<string, unknown>) => void): void {
  const path = join(root, "config", name);
  const config = readJson(path);
  edit(config);
  writeJson(path, config);
}
