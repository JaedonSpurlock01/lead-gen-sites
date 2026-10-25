import { z } from "zod";
import { blockTypes } from "./blocks";
import { formSchema } from "./form";
import { hexColor, identifier, slug } from "./primitives";

export const nicheServiceSchema = z.strictObject({
  /** URL slug under /services/ and the content file name (content/services/<slug>.md). */
  slug,
  /** Navigation label. */
  nav: z.string().min(1),
  /** Value sent in the lead form's `service` field. */
  formValue: z.string().min(1),
  /** Image slot used for this service's photo. */
  imageSlot: identifier.optional(),
});

export const imageSlotSchema = z.strictObject({
  name: identifier,
  required: z.boolean().default(true),
  description: z.string().optional(),
});

export const marketFieldSchema = z.strictObject({
  name: identifier,
  description: z.string().optional(),
});

/** Semantic color slots every shared component is written against (bg-surface, text-ink, decoration-accent...). */
export const themeColorsSchema = z.strictObject({
  surface: hexColor,
  surfaceAlt: hexColor,
  accent: hexColor,
  ink: hexColor,
  inkSoft: hexColor,
});

export const themeSchema = z.strictObject({
  /**
   * Named colors. Niches that use the shared @lead-gen/ui components must define the five
   * semantic slots (themeColorsSchema); other niches name colors for their own CSS.
   */
  colors: z.record(identifier, hexColor),
  fontSans: z.string().min(1).optional(),
  /** <meta name="theme-color">. */
  themeColor: hexColor,
});

export const nicheLayoutSchema = z.strictObject({
  heroVariants: z.array(z.string().min(1)).min(1).default(["default"]),
  /** Default home-page section order. */
  sections: z.array(z.string().min(1)).default([]),
  /** Sections a site may add to its own order (e.g. a standalone form when the hero has none). */
  optionalSections: z.array(z.string().min(1)).default([]),
});

const defaultPlaceholderPatterns = ["\\bTEMPLATE\\b", "example\\.com", "000-0000", "Replace this", "\"city-name\""];

/** `niches/<niche>/niche.json`: what every site in the niche shares. */
export const nicheSchema = z.strictObject({
  id: slug,
  /** Human name, e.g. "Asphalt Paving". */
  name: z.string().min(1),
  /** schema.org type for the business and service provider, e.g. "PavingContractor". */
  schemaOrgType: z.string().regex(/^[A-Z][A-Za-z]*$/, "use a schema.org type name"),
  services: z.array(nicheServiceSchema).min(1),
  imageSlots: z.array(imageSlotSchema).min(1),
  marketFields: z.array(marketFieldSchema).default([]),
  /** Extra values appended to the lead form select after the services, e.g. "Other". */
  extraServiceOptions: z.array(z.string().min(1)).default(["Other"]),
  theme: themeSchema,
  layout: nicheLayoutSchema.default({ heroVariants: ["default"], sections: [], optionalSections: [] }),
  /** Regex sources; `pnpm check` fails a site whose data or content matches any of them. */
  placeholderPatterns: z.array(z.string().min(1)).default(defaultPlaceholderPatterns),
  /** The lead form this niche collects; see form.ts. */
  form: formSchema,
  /** Block-based pages every site must provide as content/pages/<name>.yaml. */
  pages: z.array(slug).default([]),
  /** "markdown" (content/services/<slug>.md) or "blocks" (content/services/<slug>.yaml). */
  serviceContent: z.enum(["markdown", "blocks"]).default("markdown"),
  /** Block types this niche's pages can render. */
  blocks: z.array(z.enum(blockTypes as [string, ...string[]])).default([]),
  /** Paths left out of the sitemap, e.g. "/thank-you/". */
  sitemapExclude: z.array(z.string().startsWith("/")).default([]),
});

export type NicheInput = z.input<typeof nicheSchema>;
export type Niche = z.output<typeof nicheSchema>;
export type NicheService = z.output<typeof nicheServiceSchema>;
export type Theme = z.output<typeof themeSchema>;
