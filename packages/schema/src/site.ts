import { z } from "zod";
import { describeDomainProblem, domainProblem, siteUrl } from "./domain";
import { coordinate, e164, relativePath, slug, workerName } from "./primitives";

export const domainSchema = z.string().superRefine((value, ctx) => {
  const problem = domainProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: describeDomainProblem(problem) });
});

export const businessSchema = z.strictObject({
  name: z.string().min(1),
  phoneDisplay: z.string().min(1),
  phoneTel: e164,
  email: z.email(),
  city: z.string().min(1),
  /** Short region code used in the postal address, e.g. "ID". */
  region: z.string().min(1),
  /** Full region name used in JSON-LD, e.g. "Idaho". */
  regionName: z.string().min(1),
  country: z.string().length(2),
  latitude: coordinate.optional(),
  longitude: coordinate.optional(),
  priceRange: z.string().min(1),
  serviceAreaLabel: z.string().min(1),
});

export const socialNames = ["Facebook", "Instagram", "Twitter", "YouTube"] as const;

export const socialSchema = z.strictObject({
  name: z.enum(socialNames),
  href: z.url(),
});

const dayName = z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
const clock = z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM");

export const hoursRowSchema = z.strictObject({
  /** Display label, e.g. "Monday–Friday" (en dash), "Saturday". */
  days: z.string().min(1),
  /** Display time, e.g. "8 AM–5 PM" (en dash) or "Closed". */
  time: z.string().min(1),
  /** Structured data; when omitted, "Monday–Friday" style labels and "8 AM–5 PM" times are parsed. */
  dayOfWeek: z.array(dayName).min(1).optional(),
  opens: clock.optional(),
  closes: clock.optional(),
});

export const outboundLinkSchema = z.strictObject({
  /** Referenced from block text as {{outbound:<id>}}. */
  id: slug.optional(),
  href: z.url(),
  text: z.string().min(1),
});

export const siteLayoutSchema = z.strictObject({
  /** One of the niche's hero variants. */
  hero: z.string().min(1).optional(),
  /** Section order for the home page; each entry must be a section the niche declares. */
  sections: z.array(z.string().min(1)).optional(),
});

/**
 * `sites/<id>/site.json`. Data only. The niche is implied by the folder, the business URL and
 * the Worker custom domain derive from `domain`, and the Tracer URL comes from config/environments.json.
 */
export const siteSchema = z.strictObject({
  id: slug,
  /** Canonical apex hostname, no scheme, no www. The only source of truth for the hostname. */
  domain: domainSchema,
  /** Cloudflare Worker name. Stable for the life of the site. */
  cloudflareProject: workerName,
  /** Canary sites deploy first; a failed `domains check` on a canary stops the rollout. */
  canary: z.boolean().default(false),
  /** Niche-defined free-form market notes (keys declared by niche.json `marketFields`). */
  market: z.record(z.string(), z.string().min(1)),
  /** Image slot -> path relative to the site folder (keys declared by niche.json `imageSlots`). */
  assets: z.record(z.string(), relativePath),
  business: businessSchema,
  socials: z.array(socialSchema).default([]),
  hours: z.array(hoursRowSchema).min(1),
  /** Values offered in the lead form's service select. Must cover every niche service's formValue. */
  serviceOptions: z.array(z.string().min(1)).min(1),
  /** Links to other sites (siblings or external). Sibling links are one-way only; see `pnpm check`. */
  outboundLinks: z.array(outboundLinkSchema).default([]),
  layout: siteLayoutSchema.optional(),
  /** Per-site color overrides; keys must exist in the niche theme. */
  theme: z.strictObject({ colors: z.record(z.string(), z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)) }).optional(),
});

export type SiteInput = z.input<typeof siteSchema>;
export type Site = z.output<typeof siteSchema>;
export type Business = z.output<typeof businessSchema>;
export type HoursRow = z.output<typeof hoursRowSchema>;
export type Social = z.output<typeof socialSchema>;
export type OutboundLink = z.output<typeof outboundLinkSchema>;

/** A parsed site plus the values every consumer derives from it. */
export type ResolvedSite = Site & {
  niche: string;
  url: string;
  hostname: string;
};

export function resolveSite(site: Site, niche: string): ResolvedSite {
  return { ...site, niche, url: siteUrl(site.domain), hostname: site.domain };
}
