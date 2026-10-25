import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { loadCloudflareConfig, loadNiche, loadSite, LoadError, type LoadedSite } from "@lead-gen/engine/load";
import type { Logger } from "./log";
import { listAllSites, refKey, resolveTargets, type SiteRef } from "./targets";

export type CheckIssue = { level: "error" | "warning"; site?: string; message: string };
export type CheckReport = { ok: boolean; issues: CheckIssue[]; sites: SiteRef[]; total: number };

const textFile = /\.(json|md|ya?ml)$/;

function walkText(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "assets" || entry.name === "wrangler.jsonc") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkText(full, out);
    else if (textFile.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Validates every targeted site and the cross-site rules: schema and niche fit (through the
 * loader), placeholder text, unique ids/domains/Worker names, sibling-link budget and reciprocal
 * links, and the Workers-per-account budget.
 */
export function runCheck(root: string, target: string | undefined, logger: Logger): CheckReport {
  const issues: CheckIssue[] = [];
  const all = listAllSites(root);
  const targets = resolveTargets(root, target);
  const targeted = new Set(targets.map(refKey));
  const cloudflare = loadCloudflareConfig(root);

  const loaded = new Map<string, LoadedSite>();
  for (const ref of all) {
    try {
      loaded.set(refKey(ref), loadSite(ref.nicheDir, ref.id));
    } catch (error) {
      if (targeted.has(refKey(ref)) || !(error instanceof LoadError)) {
        issues.push({ level: "error", site: refKey(ref), message: (error as Error).message });
      }
    }
  }

  // Placeholder text left over from the template.
  for (const ref of targets) {
    const site = loaded.get(refKey(ref));
    if (!site) continue;
    const patterns = site.niche.placeholderPatterns.map((source) => new RegExp(source));
    for (const file of walkText(ref.siteDir)) {
      const text = readFileSync(file, "utf8");
      for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) {
          issues.push({
            level: "error",
            site: refKey(ref),
            message: `${relative(root, file)} still has template placeholder text: "${match[0]}" (matches /${pattern.source}/)`,
          });
        }
      }
    }
  }

  // Cross-site uniqueness.
  const seen = { id: new Map<string, string>(), domain: new Map<string, string>(), worker: new Map<string, string>() };
  for (const ref of all) {
    const site = loaded.get(refKey(ref));
    if (!site) continue;
    for (const [kind, value] of [
      ["id", site.site.id],
      ["domain", site.site.domain],
      ["worker", site.site.cloudflareProject],
    ] as const) {
      const other = seen[kind].get(value);
      if (other) {
        issues.push({ level: "error", site: refKey(ref), message: `${kind === "worker" ? "Worker name" : kind} "${value}" is also used by ${other}` });
      } else {
        seen[kind].set(value, refKey(ref));
      }
    }
  }

  // Sibling links: a budget per site, and never A -> B -> A.
  const domains = new Map<string, string>();
  for (const site of loaded.values()) domains.set(site.site.domain, refKey({ niche: site.niche.id, id: site.site.id } as SiteRef));
  const linksTo = new Map<string, Set<string>>();
  for (const site of loaded.values()) {
    const key = refKey({ niche: site.niche.id, id: site.site.id } as SiteRef);
    const siblings = new Set<string>();
    for (const link of site.site.outboundLinks) {
      let host = "";
      try {
        host = new URL(link.href).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      const sibling = domains.get(host);
      if (sibling && sibling !== key) siblings.add(sibling);
    }
    linksTo.set(key, siblings);
  }
  for (const [key, siblings] of linksTo) {
    if (!targeted.has(key)) continue;
    if (siblings.size > cloudflare.seo.outboundSiblingLinksWarnAt) {
      issues.push({
        level: "warning",
        site: key,
        message: `links to ${siblings.size} sibling sites (budget ${cloudflare.seo.outboundSiblingLinksWarnAt}); many cross-linked sites on one template look like a link network`,
      });
    }
    for (const sibling of siblings) {
      if (linksTo.get(sibling)?.has(key)) {
        issues.push({ level: "error", site: key, message: `links to ${sibling} which links back; sibling links must be one-way` });
      }
    }
  }

  // Workers budget: every site is one Worker, and the account cap also counts non-site Workers (Tracer).
  const total = all.length;
  const { limit, warnAt } = cloudflare.workersBudget;
  if (total > limit) {
    issues.push({ level: "error", message: `${total} site Workers exceed the account limit of ${limit}` });
  } else if (total >= warnAt) {
    issues.push({
      level: "warning",
      message: `${total} site Workers; the Workers Paid plan allows ${limit} per account including non-site Workers such as Tracer. Workers for Platforms is the next step beyond that.`,
    });
  }

  if (/TODO/i.test(cloudflare.secretsStore.storeId)) {
    issues.push({ level: "warning", message: "config/cloudflare.json secretsStore.storeId is still a TODO; deploy --apply will refuse until it is set" });
  }
  if (all.length > 0 && ![...loaded.values()].some((site) => site.site.canary)) {
    issues.push({ level: "warning", message: 'no site has "canary": true; deploy will roll out without the canary gate' });
  }

  for (const niche of new Set(all.map((ref) => ref.niche))) {
    try {
      loadNiche(join(root, "niches", niche));
    } catch (error) {
      issues.push({ level: "error", message: (error as Error).message });
    }
  }

  const errors = issues.filter((issue) => issue.level === "error");
  for (const ref of targets) {
    const own = issues.filter((issue) => issue.site === refKey(ref));
    if (own.length === 0) logger.log(`ok      ${refKey(ref)}`);
    for (const issue of own) (issue.level === "error" ? logger.error : logger.warn)(`${refKey(ref)}: ${issue.message}`);
  }
  for (const issue of issues.filter((issue) => !issue.site)) (issue.level === "error" ? logger.error : logger.warn)(issue.message);
  logger.log(`checked ${targets.length} site${targets.length === 1 ? "" : "s"} (${total} total): ${errors.length} error${errors.length === 1 ? "" : "s"}, ${issues.length - errors.length} warning${issues.length - errors.length === 1 ? "" : "s"}`);

  return { ok: errors.length === 0, issues, sites: targets, total };
}
