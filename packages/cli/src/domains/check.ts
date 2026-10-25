import { loadSite } from "@lead-gen/engine/load";
import { CliError, type Logger } from "../log";
import { refKey, resolveTargets, type SiteRef } from "../targets";
import { must, type CloudflareApi } from "./api";
import { httpChecks, type CheckLine, type DomainCheckResult } from "./http-checks";

export type DomainsCheckOptions = {
  /** Without credentials, only the HTTP checks run. */
  api?: CloudflareApi | null;
  accountId?: string;
  withLead?: boolean;
  fetch?: typeof fetch;
  logger: Logger;
};

type Zone = { id: string; status: string; name_servers?: string[] };
type CertPack = { status: string; hosts?: string[] };
type WorkerDomain = { hostname: string; service: string; zone_id?: string };

/** Zone and certificate state through the API (read-only), for one site. */
export async function apiChecks(api: CloudflareApi, accountId: string, domain: string, worker: string): Promise<CheckLine[]> {
  const lines: CheckLine[] = [];
  const zones = (await must<Zone[]>(api, "GET", "/zones", { query: { name: domain, "account.id": accountId } })).result;
  const zone = zones[0];
  if (!zone) return [{ name: "zone", ok: false, detail: `no zone for ${domain} in this account (run pnpm domains provision)` }];
  lines.push({ name: "zone", ok: zone.status === "active", detail: zone.status === "active" ? "active" : `${zone.status}; nameservers should be ${(zone.name_servers ?? []).join(", ")}` });

  const packs = (await must<CertPack[]>(api, "GET", `/zones/${zone.id}/ssl/certificate_packs`, { query: { status: "all" } })).result;
  const covers = (host: string) => packs.some((pack) => pack.status === "active" && (pack.hosts ?? []).some((name) => name === host || (name.startsWith("*.") && host.endsWith(name.slice(1)) && host.split(".").length === name.split(".").length)));
  const statuses = [...new Set(packs.map((pack) => pack.status))].join(", ") || "none";
  lines.push({ name: "certificate", ok: covers(domain), detail: covers(domain) ? `active for ${domain}` : `no active certificate covering ${domain} (packs: ${statuses})` });
  lines.push({ name: "www certificate", ok: covers(`www.${domain}`), detail: covers(`www.${domain}`) ? `active for www.${domain}` : `no active certificate covering www.${domain}` });

  const domains = (await must<WorkerDomain[]>(api, "GET", `/accounts/${accountId}/workers/domains`, { query: { hostname: domain } })).result;
  const attached = domains.find((item) => item.hostname === domain);
  lines.push({
    name: "worker domain",
    ok: attached?.service === worker,
    detail: attached ? `${domain} -> ${attached.service}${attached.service === worker ? "" : ` (expected ${worker})`}` : `${domain} is not attached to any Worker (deploy attaches it)`,
  });
  return lines;
}

/** Read-only health check for each site: zone active, certificate issued, / is 200, www redirects. */
export async function runDomainsCheck(root: string, target: string | undefined, options: DomainsCheckOptions): Promise<DomainCheckResult[]> {
  const { logger } = options;
  const refs = resolveTargets(root, target);
  if (refs.length === 0) throw new CliError("no sites match the target");
  if (!options.api) logger.warn("CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set: skipping zone, certificate and Worker-domain checks; running HTTP checks only");
  if (options.withLead) logger.warn("--with-lead posts a test lead to every site's /api/lead; Tracer will record it");

  const results: DomainCheckResult[] = [];
  for (const ref of refs) results.push(await checkOne(ref, options));

  for (const result of results) {
    logger.log("");
    logger.log(`${result.ok ? "ok  " : "FAIL"} ${refKey(result.ref)}  ${result.domain}`);
    for (const line of result.checks) (line.ok ? logger.log : logger.error)(`  ${line.ok ? "ok  " : "FAIL"} ${line.name}: ${line.detail}`);
  }
  const failed = results.filter((result) => !result.ok).length;
  logger.log("");
  logger.log(`domains check summary: ${results.length - failed} passed, ${failed} failed`);
  return results;
}

export async function checkOne(ref: SiteRef, options: Omit<DomainsCheckOptions, "logger">): Promise<DomainCheckResult> {
  const { site } = loadSite(ref.nicheDir, ref.id);
  const checks: CheckLine[] = [];
  if (options.api && options.accountId) {
    try {
      checks.push(...(await apiChecks(options.api, options.accountId, site.domain, site.cloudflareProject)));
    } catch (error) {
      checks.push({ name: "api", ok: false, detail: (error as Error).message });
    }
  }
  const http = await httpChecks(ref, site.domain, { fetch: options.fetch, withLead: options.withLead });
  checks.push(...http.checks);
  return { ref, domain: site.domain, ok: checks.every((check) => check.ok), checks };
}
