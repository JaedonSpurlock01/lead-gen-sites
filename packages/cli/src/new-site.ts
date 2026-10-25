import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeDomainProblem, domainProblem, siteSchema, slug as slugSchema } from "@lead-gen/schema";
import { loadSite } from "@lead-gen/engine/load";
import { CliError, type Logger } from "./log";
import { listAllSites } from "./targets";

export type NewSiteOptions = {
  domain: string;
  name?: string;
  city?: string;
  region?: string;
  regionName?: string;
  /** E.164, e.g. +12085550100. */
  phone?: string;
  canary?: boolean;
  logger: Logger;
};

/** (208) 555-0100 from +12085550100; other countries keep the E.164 form. */
export function displayPhone(e164: string): string {
  const match = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}

/**
 * Copies niches/<niche>/sites/_template to sites/<id> and fills in the identity fields. Content
 * stays as tokenized template text so `check` keeps failing until real copy replaces it.
 */
export function runNewSite(root: string, niche: string, id: string, options: NewSiteOptions): string {
  const { logger } = options;
  const nicheDir = join(root, "niches", niche);
  if (!existsSync(join(nicheDir, "niche.json"))) throw new CliError(`no niche "${niche}" under niches/`);
  const template = join(nicheDir, "sites", "_template");
  if (!existsSync(template)) throw new CliError(`${niche} has no sites/_template to copy from`);
  const idCheck = slugSchema.safeParse(id);
  if (!idCheck.success) throw new CliError(`site id "${id}": ${idCheck.error.issues[0]?.message}`);
  const problem = domainProblem(options.domain);
  if (problem) throw new CliError(`--domain ${options.domain}: ${describeDomainProblem(problem)}`);
  const siteDir = join(nicheDir, "sites", id);
  if (existsSync(siteDir)) throw new CliError(`${siteDir} already exists`);

  const existing = listAllSites(root);
  const clash = existing.find((ref) => ref.id === id);
  if (clash) throw new CliError(`site id "${id}" is already used by ${clash.niche}/${clash.id}; ids must be unique across niches`);
  for (const ref of existing) {
    const site = loadSite(ref.nicheDir, ref.id).site;
    if (site.domain === options.domain) throw new CliError(`domain ${options.domain} is already used by ${ref.niche}/${ref.id}`);
  }

  cpSync(template, siteDir, { recursive: true });
  const siteFile = join(siteDir, "site.json");
  const data = JSON.parse(readFileSync(siteFile, "utf8")) as Record<string, unknown> & { business: Record<string, string> };
  data.id = id;
  data.domain = options.domain;
  data.cloudflareProject = `${niche}-${id}`;
  data.canary = options.canary ?? false;
  data.business.email = `info@${options.domain}`;
  if (options.name) data.business.name = options.name;
  if (options.city) {
    data.business.city = options.city;
    data.business.serviceAreaLabel = `${options.city}, ${options.regionName ?? data.business.regionName}`;
  }
  if (options.region) data.business.region = options.region;
  if (options.regionName) data.business.regionName = options.regionName;
  if (options.phone) {
    data.business.phoneTel = options.phone;
    data.business.phoneDisplay = displayPhone(options.phone);
  }
  const parsed = siteSchema.safeParse(data);
  if (!parsed.success) throw new CliError(`generated site.json is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  writeFileSync(siteFile, `${JSON.stringify(data, null, 2)}\n`);

  const keywordMap = join(siteDir, "keyword-map.md");
  if (existsSync(keywordMap)) writeFileSync(keywordMap, readFileSync(keywordMap, "utf8").replace(/\{\{city\}\}/g, data.business.city ?? id));

  loadSite(nicheDir, id);
  logger.log(`created niches/${niche}/sites/${id} (domain ${options.domain}, Worker ${data.cloudflareProject})`);
  logger.log("Next:");
  logger.log(`  1. Fill in business, hours, market and socials in niches/${niche}/sites/${id}/site.json`);
  logger.log(`  2. Replace every content/services/*.md with original, locally researched copy (see niches/${niche}/prompts/)`);
  logger.log(`  3. Add site photos under sites/${id}/assets/ and point site.json assets at them`);
  logger.log(`  4. pnpm check ${id}`);
  logger.log(`  5. pnpm domains provision ${id}   (dry-run; add --apply when ready)`);
  logger.log(`  6. pnpm run deploy ${id}   (dry-run; add --apply when ready)`);
  return siteDir;
}
