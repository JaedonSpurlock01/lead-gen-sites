import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { listAllSites, refKey, type SiteRef } from "./targets";
import { CliError } from "./log";

export type FailureRecord = { command: string; at: string; sites: string[] };

const failureFile = (root: string, command: string) => join(root, ".cache", command, "failed.json");

/** Remembers which sites failed so `--retry-failed` can re-run only those. */
export function saveFailures(root: string, command: string, failed: SiteRef[]): void {
  const path = failureFile(root, command);
  if (failed.length === 0) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const record: FailureRecord = { command, at: new Date().toISOString(), sites: failed.map(refKey) };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

export function loadFailures(root: string, command: string): SiteRef[] {
  const path = failureFile(root, command);
  if (!existsSync(path)) throw new CliError(`nothing to retry: no ${command} failures recorded in ${path}`);
  const record = JSON.parse(readFileSync(path, "utf8")) as FailureRecord;
  const all = new Map(listAllSites(root).map((ref) => [refKey(ref), ref]));
  const refs: SiteRef[] = [];
  for (const key of record.sites) {
    const ref = all.get(key);
    if (!ref) throw new CliError(`recorded failure ${key} no longer exists`);
    refs.push(ref);
  }
  return refs;
}
