import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SiteRef } from "./targets";

const skippedDirs = new Set(["node_modules", "dist", ".astro", ".cache", ".git", ".wrangler"]);

function walk(dir: string, skip: (relPath: string) => boolean, base = dir, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (skippedDirs.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = relative(base, full);
    if (skip(rel)) continue;
    if (entry.isDirectory()) walk(full, skip, base, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export type HashInput = { dir: string; skip?: (relPath: string) => boolean };

/** sha256 over (path, content) pairs of every file in the given directories and files. */
export function hashInputs(root: string, dirs: HashInput[], files: string[] = []): string {
  const hash = createHash("sha256");
  const all = [
    ...dirs.flatMap((input) => walk(input.dir, input.skip ?? (() => false))),
    ...files.filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    }),
  ].sort();
  for (const file of all) {
    hash.update(relative(root, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** Input hash = site files + niche (minus sites/) + packages + config + lockfile. Changes to other sites do not count. */
export function siteInputHash(root: string, ref: SiteRef): string {
  return hashInputs(
    root,
    [
      { dir: ref.siteDir, skip: (rel) => rel === "wrangler.jsonc" },
      { dir: ref.nicheDir, skip: (rel) => rel === "sites" || rel.startsWith("sites/") },
      { dir: join(root, "packages") },
      { dir: join(root, "config") },
    ],
    [join(root, "pnpm-lock.yaml")],
  );
}
