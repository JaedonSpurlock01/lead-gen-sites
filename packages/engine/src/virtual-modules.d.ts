declare module "virtual:site" {
  import type { ResolvedSite } from "@lead-gen/schema";
  const site: ResolvedSite;
  export default site;
}

declare module "virtual:niche" {
  import type { Niche } from "@lead-gen/schema";
  const niche: Niche;
  export default niche;
}

declare module "virtual:content" {
  import type { BlockPage, ServicePage } from "@lead-gen/schema";
  export const services: ServicePage[];
  export function getService(slug: string): ServicePage | undefined;
  export const pages: Record<string, BlockPage>;
  export function getPage(name: string): BlockPage;
}

declare module "virtual:theme" {
  import type { Theme } from "@lead-gen/schema";
  /** The niche theme with this site's color overrides applied. */
  const theme: Theme;
  export default theme;
}

declare module "virtual:copy" {
  import type { Copy } from "@lead-gen/schema";
  const copy: Copy;
  export default copy;
}

declare module "virtual:site-assets" {
  import type { ImageMetadata } from "astro";
  const assets: Record<string, ImageMetadata>;
  export default assets;
}
