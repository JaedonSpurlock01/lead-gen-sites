import { spawnSync } from "node:child_process";
import { listNiches } from "@lead-gen/engine/load";
import { listAllSites } from "./targets";

export type Affected = {
  /** Deploy target for `pnpm run deploy`: "all", a comma-separated list of niches/sites, or "" for nothing. */
  target: string;
  reasons: string[];
};

const everything = [/^packages\//, /^config\//, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^package\.json$/, /^\.node-version$/];

/**
 * Maps changed paths to what must redeploy:
 * - packages/**, config/**, the lockfile or root manifests -> every site
 * - niches/X/** outside sites/ -> every site in niche X
 * - niches/X/sites/Y/** -> site Y
 * Underscore folders (_template) never deploy. Anything else (docs, workflows, .claude) deploys nothing.
 */
export function affectedTargets(root: string, changed: string[]): Affected {
  const niches = new Set(listNiches(root));
  const sites = new Set(listAllSites(root).map((ref) => `${ref.niche}/${ref.id}`));
  const nicheTargets = new Set<string>();
  const siteTargets = new Set<string>();
  const reasons: string[] = [];

  for (const path of changed.map((item) => item.trim()).filter(Boolean)) {
    if (everything.some((pattern) => pattern.test(path))) {
      return { target: "all", reasons: [`${path} is shared by every site`] };
    }
    const match = path.match(/^niches\/([^/]+)\/(?:sites\/([^/]+)\/)?/);
    if (!match) continue;
    const [, niche, site] = match as unknown as [string, string, string | undefined];
    if (niche.startsWith("_") || !niches.has(niche)) continue;
    if (site === undefined) {
      if (!nicheTargets.has(niche)) reasons.push(`${path} -> niche ${niche}`);
      nicheTargets.add(niche);
    } else if (!site.startsWith("_") && sites.has(`${niche}/${site}`)) {
      if (!siteTargets.has(`${niche}/${site}`)) reasons.push(`${path} -> site ${niche}/${site}`);
      siteTargets.add(`${niche}/${site}`);
    }
  }
  const sitesOutsideNiches = [...siteTargets].filter((key) => !nicheTargets.has(key.split("/")[0]!));
  return { target: [...[...nicheTargets].sort(), ...sitesOutsideNiches.sort()].join(","), reasons };
}

export function changedFiles(root: string, base: string, head = "HEAD"): string[] {
  const result = spawnSync("git", ["diff", "--name-only", `${base}...${head}`], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git diff ${base}...${head} failed: ${result.stderr.trim()}`);
  return result.stdout.split("\n").filter(Boolean);
}
