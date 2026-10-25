import { join } from "node:path";
import { listNiches, listSites } from "@lead-gen/engine/load";
import { CliError } from "./log";

export type SiteRef = {
  niche: string;
  id: string;
  nicheDir: string;
  siteDir: string;
};

export const refKey = (ref: SiteRef) => `${ref.niche}/${ref.id}`;

export function listAllSites(root: string): SiteRef[] {
  const refs: SiteRef[] = [];
  for (const niche of listNiches(root)) {
    const nicheDir = join(root, "niches", niche);
    for (const id of listSites(nicheDir)) {
      refs.push({ niche, id, nicheDir, siteDir: join(nicheDir, "sites", id) });
    }
  }
  return refs;
}

/**
 * Resolves `all`, a niche id, a site id, or `niche/site` to the sites it names.
 * Site ids are expected to be unique across niches (`check` enforces it); an ambiguous id is an error.
 */
export function resolveTargets(root: string, target: string | undefined): SiteRef[] {
  const all = listAllSites(root);
  const wanted = (target ?? "all").trim();
  if (wanted === "all" || wanted === "") return all;

  if (wanted.includes("/")) {
    const [niche, id] = wanted.split("/");
    const match = all.find((ref) => ref.niche === niche && ref.id === id);
    if (!match) throw new CliError(`no site ${wanted}`);
    return [match];
  }

  const byNiche = all.filter((ref) => ref.niche === wanted);
  if (byNiche.length > 0) return byNiche;
  if (listNiches(root).includes(wanted)) return [];

  const bySite = all.filter((ref) => ref.id === wanted);
  if (bySite.length === 1) return bySite;
  if (bySite.length > 1) {
    throw new CliError(`site id "${wanted}" exists in several niches (${bySite.map(refKey).join(", ")}); use niche/site`);
  }
  throw new CliError(`no niche or site named "${wanted}". Niches: ${listNiches(root).join(", ") || "(none)"}`);
}
