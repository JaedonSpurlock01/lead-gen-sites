import { loadCloudflareConfig, loadSite, loadZoneSettings } from "@lead-gen/engine/load";
import type { CloudflareConfig, ZoneSettingsConfig } from "@lead-gen/schema";
import { CliError, type Logger } from "../log";
import { refKey, resolveTargets, type SiteRef } from "../targets";
import { CloudflareApiError, getOrNull, must, type CloudflareApi } from "./api";
import { ZoneCreationBudget } from "./zone-budget";

export type StepStatus = "ok" | "create" | "update" | "todo" | "manual" | "blocked" | "error";
export type PlannedRequest = { method: "POST" | "PATCH" | "PUT"; path: string; body: unknown };
export type Step = { name: string; status: StepStatus; detail: string; request?: PlannedRequest };
export type SiteProvision = { ref: SiteRef; domain: string; zoneId: string | null; nameServers: string[]; steps: Step[] };

export type ProvisionOptions = {
  api: CloudflareApi;
  accountId: string;
  apply?: boolean;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

type Zone = { id: string; name: string; status: string; name_servers?: string[] };
type DnsRecord = { id: string; type: string; name: string; content: string; proxied?: boolean; priority?: number };
type Rule = { id?: string; ref?: string; expression: string; action: string; action_parameters?: unknown; description?: string; enabled?: boolean };
type Ruleset = { id: string; rules?: Rule[] };

export const redirectPhase = "http_request_dynamic_redirect";
export const redirectRuleRef = "lead_gen_www_to_apex";
const PENDING_ZONE = "<new-zone-id>";

/** The www -> apex 301 that keeps path and query string. */
export function wwwRedirectRule(domain: string): Rule {
  return {
    ref: redirectRuleRef,
    description: `lead-gen: 301 www.${domain} to https://${domain}, keeping path and query`,
    expression: `(http.host eq "www.${domain}")`,
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 301,
        target_url: { expression: `concat("https://${domain}", http.request.uri.path)` },
        preserve_query_string: true,
      },
    },
    enabled: true,
  };
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item,
  );

function ruleMatches(existing: Rule, wanted: Rule): boolean {
  return (
    existing.expression === wanted.expression &&
    existing.action === wanted.action &&
    existing.enabled !== false &&
    stable(existing.action_parameters) === stable(wanted.action_parameters)
  );
}

class SitePlanner {
  readonly steps: Step[] = [];
  constructor(
    private readonly api: CloudflareApi,
    private readonly apply: boolean,
  ) {}

  ok(name: string, detail: string) {
    this.steps.push({ name, status: "ok", detail });
  }
  note(name: string, status: "todo" | "manual" | "blocked", detail: string) {
    this.steps.push({ name, status, detail });
  }

  /** A write: executed with --apply, otherwise recorded as the request it would make. */
  async write<T>(name: string, status: "create" | "update", detail: string, request: PlannedRequest): Promise<T | null> {
    this.steps.push({ name, status, detail, request });
    if (!this.apply) return null;
    const response = await must<T>(this.api, request.method, request.path, { body: request.body });
    return response.result;
  }
}

async function zoneCounts(api: CloudflareApi, accountId: string) {
  const count = async (status?: string) => {
    const response = await must<Zone[]>(api, "GET", "/zones", { query: { "account.id": accountId, status, per_page: 5 } });
    return response.result_info?.total_count ?? response.result.length;
  };
  return { total: await count(), pending: await count("pending"), active: await count("active") };
}

/**
 * Idempotent per-site setup: zone, standard settings, proxied www record, www -> apex redirect,
 * all for one site. Reads always run; writes run only with `apply`.
 */
export async function runDomainsProvision(root: string, target: string | undefined, options: ProvisionOptions): Promise<SiteProvision[]> {
  const { api, accountId, logger } = options;
  const apply = options.apply ?? false;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const cloudflare = loadCloudflareConfig(root);
  const zoneSettings = loadZoneSettings(root);
  const budget = new ZoneCreationBudget(root, cloudflare.zones.createPerWindow, cloudflare.zones.windowMs, options.now);
  const refs = resolveTargets(root, target);
  if (refs.length === 0) throw new CliError("no sites match the target");

  logger.log(apply ? `Provisioning ${refs.length} site(s):` : `Provision plan for ${refs.length} site(s) (dry-run; reads only, pass --apply to make changes):`);

  let counts: { total: number; pending: number; active: number } | null = null;
  const results: SiteProvision[] = [];
  let stopReason: string | null = null;

  for (const ref of refs) {
    const { site } = loadSite(ref.nicheDir, ref.id);
    const domain = site.domain;
    const plan = new SitePlanner(api, apply);
    const result: SiteProvision = { ref, domain, zoneId: null, nameServers: [], steps: plan.steps };
    results.push(result);

    if (stopReason) {
      plan.note("zone", "blocked", `not attempted: ${stopReason}`);
      continue;
    }

    try {
      // 1. Zone.
      const found = await must<Zone[]>(api, "GET", "/zones", { query: { name: domain, "account.id": accountId } });
      let zone = found.result[0] ?? null;
      if (zone) {
        result.zoneId = zone.id;
        result.nameServers = zone.name_servers ?? [];
        if (zone.status === "active") plan.ok("zone", `${domain} exists (active)`);
        else plan.note("manual", "manual", `zone is ${zone.status}: set the registrar nameservers to ${result.nameServers.join(", ") || "(see dashboard)"}`);
      } else {
        counts ??= await zoneCounts(api, accountId);
        if (counts.total > cloudflare.zones.pendingRuleAbove && counts.pending > counts.active) {
          stopReason = `account has ${counts.total} zones with ${counts.pending} pending and ${counts.active} active; Cloudflare blocks new zones until fewer are pending than active. Finish nameserver changes, wait for activation, then re-run.`;
          plan.note("zone", "blocked", stopReason);
          continue;
        }
        const wait = budget.waitMs();
        if (wait > 0) {
          if (!apply) {
            plan.note("zone", "blocked", `zone-creation budget used (${budget.used()}/${cloudflare.zones.createPerWindow} in 10 min); --apply would wait ${Math.ceil(wait / 1000)}s here`);
          } else {
            logger.warn(`zone-creation budget used (${budget.used()}/${cloudflare.zones.createPerWindow} in 10 minutes); waiting ${Math.ceil(wait / 1000)}s before creating ${domain}`);
            await sleep(wait);
          }
        }
        try {
          zone = await plan.write<Zone>("zone", "create", `create zone ${domain} (full setup)`, {
            method: "POST",
            path: "/zones",
            body: { name: domain, account: { id: accountId }, type: "full" },
          });
        } catch (error) {
          if (error instanceof CloudflareApiError && (error.status === 429 || /limit|too many|rate/i.test(error.message))) {
            stopReason = `Cloudflare refused a new zone (${error.message}); the zone limits are 25 per 10 minutes, and none while more are pending than active above 50 zones. Re-run later.`;
            plan.steps.pop();
            plan.note("zone", "blocked", stopReason);
            continue;
          }
          throw error;
        }
        if (apply) budget.record();
        counts = { ...counts, total: counts.total + 1, pending: counts.pending + 1 };
        result.zoneId = zone?.id ?? null;
        result.nameServers = zone?.name_servers ?? [];
        plan.note("manual", "manual", zone
          ? `set the registrar nameservers for ${domain} to: ${result.nameServers.join(", ")}`
          : `after creation, set the registrar nameservers to the two Cloudflare assigns (printed by --apply)`);
      }
      const zoneId = result.zoneId ?? PENDING_ZONE;
      const known = result.zoneId !== null;

      // 2. Zone settings.
      await ensureSettings(plan, api, zoneId, known, zoneSettings);

      // 3. Proxied www record (unless www is still served by a Worker, see wwwServedByWorker).
      const wwwWorker = known ? await wwwServedByWorker(api, accountId, zoneId, domain) : null;
      if (wwwWorker) plan.note("manual", "manual", wwwWorker);
      else await ensureWwwRecord(plan, api, zoneId, known, domain, cloudflare);

      // 4. www -> apex redirect rule.
      await ensureRedirect(plan, api, zoneId, known, domain);

    } catch (error) {
      plan.steps.push({ name: "error", status: "error", detail: (error as Error).message });
    }
  }

  printReport(logger, results, apply);
  return results;
}

async function ensureSettings(plan: SitePlanner, api: CloudflareApi, zoneId: string, known: boolean, config: ZoneSettingsConfig) {
  for (const [id, value] of Object.entries(config.settings)) {
    const path = `/zones/${zoneId}/settings/${id}`;
    const current = known ? await getOrNull<{ value: unknown }>(api, path) : null;
    if (current && stable(current.value) === stable(value)) {
      plan.ok(`setting ${id}`, `${JSON.stringify(value)}`);
      continue;
    }
    await plan.write(`setting ${id}`, "update", `${current ? JSON.stringify(current.value) : "(default)"} -> ${JSON.stringify(value)}`, { method: "PATCH", path, body: { value } });
  }
}

type WorkerDomain = { hostname: string; service: string };
type WorkerRoute = { pattern: string; script?: string };

/**
 * www may still be served by a Worker. If www is a Worker custom domain, its DNS
 * record belongs to that custom domain and a placeholder record cannot be added beside it; the next
 * `wrangler deploy` (whose routes list only the apex) detaches it and removes that record. If www is
 * a Worker route, the existing proxied record stays and the redirect rule is all that is needed.
 */
async function wwwServedByWorker(api: CloudflareApi, accountId: string, zoneId: string, domain: string): Promise<string | null> {
  const www = `www.${domain}`;
  const domains = (await must<WorkerDomain[]>(api, "GET", `/accounts/${accountId}/workers/domains`, { query: { hostname: www } })).result;
  const attached = domains.find((item) => item.hostname === www);
  if (attached) {
    return `${www} is attached to Worker ${attached.service} as a custom domain, so it serves duplicate pages today. The redirect rule above makes it 301 once created. The next \`pnpm deploy\` detaches it (Wrangler syncs custom domains to wrangler.jsonc), which removes its DNS record: re-run \`pnpm domains provision\` with --apply right after that deploy to add the proxied placeholder record.`;
  }
  const routes = (await must<WorkerRoute[]>(api, "GET", `/zones/${zoneId}/workers/routes`)).result;
  const route = routes.find((item) => item.script && (item.pattern.startsWith(`${www}/`) || item.pattern.startsWith(`*${domain}/`) || item.pattern.startsWith(`*.${domain}/`)));
  if (route) {
    return `${www} is routed to Worker ${route.script} by route ${route.pattern}. The redirect rule above makes it 301; the next \`pnpm deploy\` removes the route (Wrangler syncs routes to wrangler.jsonc) and the existing proxied www record keeps the redirect working.`;
  }
  return null;
}

async function ensureWwwRecord(plan: SitePlanner, api: CloudflareApi, zoneId: string, known: boolean, domain: string, cloudflare: CloudflareConfig) {
  const name = `www.${domain}`;
  const records = known ? (await must<DnsRecord[]>(api, "GET", `/zones/${zoneId}/dns_records`, { query: { "name.exact": name } })).result : [];
  const routable = records.filter((record) => ["A", "AAAA", "CNAME"].includes(record.type));
  if (routable.length === 0) {
    await plan.write("www record", "create", `proxied ${cloudflare.wwwRecord.type} ${name} -> ${cloudflare.wwwRecord.content} (placeholder so the redirect rule can run)`, {
      method: "POST",
      path: `/zones/${zoneId}/dns_records`,
      body: { type: cloudflare.wwwRecord.type, name, content: cloudflare.wwwRecord.content, proxied: true, ttl: 1, comment: "lead-gen: www -> apex redirect" },
    });
    return;
  }
  for (const record of routable) {
    if (record.proxied) plan.ok("www record", `${record.type} ${name} -> ${record.content} (proxied)`);
    else {
      await plan.write("www record", "update", `${record.type} ${name} is DNS-only; turn on the proxy so the redirect rule applies`, {
        method: "PATCH",
        path: `/zones/${zoneId}/dns_records/${record.id}`,
        body: { proxied: true },
      });
    }
  }
}

async function ensureRedirect(plan: SitePlanner, api: CloudflareApi, zoneId: string, known: boolean, domain: string) {
  const wanted = wwwRedirectRule(domain);
  const entry = known ? await getOrNull<Ruleset>(api, `/zones/${zoneId}/rulesets/phases/${redirectPhase}/entrypoint`) : null;
  if (!entry) {
    await plan.write("redirect rule", "create", `create the ${redirectPhase} entry point with the www -> apex 301`, {
      method: "POST",
      path: `/zones/${zoneId}/rulesets`,
      body: { name: "lead-gen redirect rules", kind: "zone", phase: redirectPhase, rules: [wanted] },
    });
    return;
  }
  const existing = (entry.rules ?? []).find((rule) => rule.ref === redirectRuleRef);
  if (!existing) {
    await plan.write("redirect rule", "create", `add the www -> apex 301 to ruleset ${entry.id}`, { method: "POST", path: `/zones/${zoneId}/rulesets/${entry.id}/rules`, body: wanted });
  } else if (!ruleMatches(existing, wanted)) {
    await plan.write("redirect rule", "update", `rule ${existing.id} differs from the standard www -> apex 301`, {
      method: "PATCH",
      path: `/zones/${zoneId}/rulesets/${entry.id}/rules/${existing.id}`,
      body: wanted,
    });
  } else {
    plan.ok("redirect rule", `www.${domain} -> https://${domain} (301, path + query kept)`);
  }
}


const marks: Record<StepStatus, string> = { ok: "ok    ", create: "CREATE", update: "UPDATE", todo: "TODO  ", manual: "MANUAL", blocked: "BLOCK ", error: "ERROR " };

function printReport(logger: Logger, results: SiteProvision[], apply: boolean) {
  for (const result of results) {
    logger.log("");
    logger.log(`${refKey(result.ref)}  ${result.domain}${result.zoneId ? `  (zone ${result.zoneId})` : ""}`);
    for (const step of result.steps) {
      const line = `  ${marks[step.status]} ${step.name}: ${step.detail}`;
      if (step.status === "error" || step.status === "blocked") logger.error(line.trim());
      else logger.log(line);
      if (step.request && !apply) logger.log(`           would ${step.request.method} ${step.request.path} ${JSON.stringify(step.request.body)}`);
    }
  }
  const writes = results.flatMap((result) => result.steps).filter((step) => step.status === "create" || step.status === "update").length;
  const failed = results.filter((result) => result.steps.some((step) => step.status === "error" || step.status === "blocked")).length;
  logger.log("");
  logger.log(
    apply
      ? `provision summary: ${writes} change(s) made, ${failed} site(s) with errors or blocked`
      : `provision summary: ${writes} change(s) would be made, ${failed} site(s) with errors or blocked (dry-run; nothing was changed)`,
  );
}
