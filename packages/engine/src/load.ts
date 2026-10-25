import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  applyTokensDeep,
  cloudflareConfigSchema,
  copySchema,
  emailDnsConfigSchema,
  environmentsConfigSchema,
  nicheSchema,
  parseServicePage,
  resolveSite,
  siteSchema,
  tokenContext,
  validateServicePages,
  validateSiteForNiche,
  zoneSettingsConfigSchema,
  type CloudflareConfig,
  type Copy,
  type EmailDnsConfig,
  type EnvironmentsConfig,
  type Niche,
  type ResolvedSite,
  type ServicePage,
  type ZoneSettingsConfig,
} from "@lead-gen/schema";
import { ZodError } from "zod";

export class LoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoadError";
  }
}

function formatZod(error: ZodError): string {
  return error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
}

function parseWith<T>(schema: { parse(input: unknown): T }, input: unknown, label: string): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) throw new LoadError(`${label} is invalid:\n${formatZod(error)}`);
    throw error;
  }
}

export function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new LoadError(`missing file ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new LoadError(`${path} is not valid JSON: ${(error as Error).message}`);
  }
}

/** Walks up from `from` to the directory holding pnpm-workspace.yaml. */
export function findRepoRoot(from: string): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new LoadError(`no pnpm-workspace.yaml above ${from}`);
    dir = parent;
  }
}

const isVisible = (name: string) => !name.startsWith("_") && !name.startsWith(".");

export function listNiches(root: string): string[] {
  const dir = join(root, "niches");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isVisible(entry.name) && existsSync(join(dir, entry.name, "niche.json")))
    .map((entry) => entry.name)
    .sort();
}

export function listSites(nicheDir: string): string[] {
  const dir = join(nicheDir, "sites");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isVisible(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function loadNiche(nicheDir: string): Niche {
  const niche = parseWith(nicheSchema, readJson(join(nicheDir, "niche.json")), `${nicheDir}/niche.json`);
  if (niche.id !== basename(nicheDir)) {
    throw new LoadError(`${nicheDir}/niche.json has id "${niche.id}" but the folder is "${basename(nicheDir)}"`);
  }
  return niche;
}

export function loadCopy(nicheDir: string, site: ResolvedSite, tokens = tokenContext(site)): Copy {
  const dir = join(nicheDir, "copy");
  if (!existsSync(dir)) return {};
  const merged: Record<string, unknown> = {};
  for (const name of readdirSync(dir).filter((file) => /\.ya?ml$/.test(file)).sort()) {
    const data = parseYaml(readFileSync(join(dir, name), "utf8")) as Record<string, unknown> | null;
    Object.assign(merged, data ?? {});
  }
  const copy = parseWith(copySchema, merged, `${dir}/*.yaml`);
  try {
    return applyTokensDeep(copy, tokens);
  } catch (error) {
    throw new LoadError(`${dir}: ${(error as Error).message}`);
  }
}

export type LoadedSite = {
  root: string;
  nicheDir: string;
  siteDir: string;
  niche: Niche;
  site: ResolvedSite;
  services: ServicePage[];
  copy: Copy;
  /** Image slot -> absolute file path. */
  assetPaths: Record<string, string>;
};

/**
 * Loads and fully validates one site: site.json against the schema and the niche, every service
 * content file, the niche copy with this site's tokens applied, and every referenced asset.
 */
export function loadSite(nicheDir: string, siteId: string): LoadedSite {
  const root = findRepoRoot(nicheDir);
  const niche = loadNiche(nicheDir);
  const siteDir = join(nicheDir, "sites", siteId);
  const siteFile = join(siteDir, "site.json");
  const parsed = parseWith(siteSchema, readJson(siteFile), siteFile);
  // `_template` and other underscore folders are never built, so their id is free to be a placeholder.
  if (parsed.id !== siteId && !siteId.startsWith("_")) {
    throw new LoadError(`${siteFile} has id "${parsed.id}" but the folder is "${siteId}"`);
  }
  const site = resolveSite(parsed, niche.id);

  const issues = validateSiteForNiche(parsed, niche);
  if (issues.length > 0) throw new LoadError(`${siteFile} does not fit niche ${niche.id}:\n${issues.map((issue) => `  ${issue}`).join("\n")}`);

  const servicesDir = join(siteDir, "content", "services");
  const present = existsSync(servicesDir)
    ? readdirSync(servicesDir).filter((file) => file.endsWith(".md")).map((file) => file.slice(0, -3))
    : [];
  const pageIssues = validateServicePages(present, niche);
  if (pageIssues.length > 0) throw new LoadError(`${siteDir}:\n${pageIssues.map((issue) => `  ${issue}`).join("\n")}`);
  const tokens = tokenContext(site);
  const services = niche.services.map((service) => {
    const file = join(servicesDir, `${service.slug}.md`);
    try {
      return applyTokensDeep(parseServicePage(readFileSync(file, "utf8"), service), tokens);
    } catch (error) {
      const message = error instanceof ZodError ? formatZod(error) : (error as Error).message;
      throw new LoadError(`${file}: ${message}`);
    }
  });

  const assetPaths: Record<string, string> = {};
  for (const [slot, relativePath] of Object.entries(site.assets)) {
    const absolute = resolve(siteDir, relativePath);
    if (!absolute.startsWith(nicheDir)) throw new LoadError(`${siteFile}: assets.${slot} points outside the niche`);
    if (!existsSync(absolute)) throw new LoadError(`${siteFile}: assets.${slot} not found at ${absolute}`);
    assetPaths[slot] = absolute;
  }

  return { root, nicheDir, siteDir, niche, site, services, copy: loadCopy(nicheDir, site, tokens), assetPaths };
}

export function requireSiteId(): string {
  const id = process.env.SITE?.trim();
  if (!id) throw new LoadError("SITE is required. Run commands with SITE=<site-id>, for example: SITE=pocatello pnpm astro build");
  if (!/^[a-z0-9-]+$/.test(id)) throw new LoadError(`Invalid SITE id "${id}". Use lowercase letters, numbers, and hyphens.`);
  return id;
}

export function loadEnvironments(root: string): EnvironmentsConfig {
  return parseWith(environmentsConfigSchema, readJson(join(root, "config", "environments.json")), "config/environments.json");
}

export function loadCloudflareConfig(root: string): CloudflareConfig {
  return parseWith(cloudflareConfigSchema, readJson(join(root, "config", "cloudflare.json")), "config/cloudflare.json");
}

export function loadZoneSettings(root: string): ZoneSettingsConfig {
  return parseWith(zoneSettingsConfigSchema, readJson(join(root, "config", "zone-settings.json")), "config/zone-settings.json");
}

export function loadEmailDns(root: string): EmailDnsConfig {
  return parseWith(emailDnsConfigSchema, readJson(join(root, "config", "email-dns.json")), "config/email-dns.json");
}
