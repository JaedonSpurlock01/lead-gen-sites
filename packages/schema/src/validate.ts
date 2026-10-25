import type { Niche } from "./niche";
import type { Site } from "./site";

/** Cross-file rules a single zod schema cannot express: the site must fit its niche. */
export function validateSiteForNiche(site: Site, niche: Niche): string[] {
  const issues: string[] = [];

  for (const field of niche.marketFields) {
    if (!site.market[field.name]) issues.push(`market.${field.name} is required by niche ${niche.id}`);
  }
  const knownMarket = new Set(niche.marketFields.map((field) => field.name));
  for (const key of Object.keys(site.market)) {
    if (!knownMarket.has(key)) issues.push(`market.${key} is not declared in niche.json marketFields`);
  }

  const knownSlots = new Set(niche.imageSlots.map((slot) => slot.name));
  for (const slot of niche.imageSlots) {
    if (slot.required && !site.assets[slot.name]) issues.push(`assets.${slot.name} is required by niche ${niche.id}`);
  }
  for (const key of Object.keys(site.assets)) {
    if (!knownSlots.has(key)) issues.push(`assets.${key} is not declared in niche.json imageSlots`);
  }

  const options = new Set(site.serviceOptions);
  for (const service of niche.services) {
    if (!options.has(service.formValue)) issues.push(`serviceOptions is missing "${service.formValue}" (service ${service.slug})`);
  }

  if (site.layout?.hero && !niche.layout.heroVariants.includes(site.layout.hero)) {
    issues.push(`layout.hero "${site.layout.hero}" is not one of ${niche.layout.heroVariants.join(", ")}`);
  }
  const allowedSections = new Set([...niche.layout.sections, ...niche.layout.optionalSections]);
  for (const section of site.layout?.sections ?? []) {
    if (!allowedSections.has(section)) issues.push(`layout.sections entry "${section}" is not declared by the niche`);
  }

  return issues;
}

/** Every niche service needs a content file, and no content file may name a service the niche lacks. */
export function validateServicePages(slugs: string[], niche: Niche): string[] {
  const issues: string[] = [];
  const present = new Set(slugs);
  for (const service of niche.services) {
    if (!present.has(service.slug)) issues.push(`content/services/${service.slug}.md is missing`);
  }
  const known = new Set(niche.services.map((service) => service.slug));
  for (const slug of slugs) {
    if (!known.has(slug)) issues.push(`content/services/${slug}.md is not a service in niche.json`);
  }
  return issues;
}
