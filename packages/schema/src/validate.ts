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
  for (const section of site.layout?.sections ?? []) {
    if (!niche.layout.sections.includes(section)) issues.push(`layout.sections entry "${section}" is not declared by the niche`);
  }

  return issues;
}

/** Service pages must cover exactly the niche's services, with matching nav labels and form values. */
export function validateServicePages(
  pages: { slug: string; nav: string; formValue: string }[],
  niche: Niche,
): string[] {
  const issues: string[] = [];
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  for (const service of niche.services) {
    const page = bySlug.get(service.slug);
    if (!page) {
      issues.push(`content/services/${service.slug}.md is missing`);
      continue;
    }
    if (page.nav !== service.nav) issues.push(`${service.slug}: nav "${page.nav}" should be "${service.nav}"`);
    if (page.formValue !== service.formValue) {
      issues.push(`${service.slug}: formValue "${page.formValue}" should be "${service.formValue}"`);
    }
  }
  const known = new Set(niche.services.map((service) => service.slug));
  for (const page of pages) {
    if (!known.has(page.slug)) issues.push(`content/services/${page.slug}.md is not a service in niche.json`);
  }
  return issues;
}
