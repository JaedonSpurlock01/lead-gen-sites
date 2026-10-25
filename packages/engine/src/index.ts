import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import type { AstroIntegration, AstroUserConfig } from "astro";
import { loadSite, requireSiteId, type LoadedSite } from "./load";
import { virtualModulesPlugin } from "./virtual";

export { loadSite, requireSiteId, type LoadedSite } from "./load";

function leadGenIntegration(): AstroIntegration {
  return {
    name: "lead-gen",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        injectRoute({ pattern: "/api/lead", entrypoint: "@lead-gen/leads/route.ts", prerender: false });
        injectRoute({ pattern: "/robots.txt", entrypoint: "@lead-gen/engine/routes/robots.ts", prerender: true });
      },
    },
  };
}

/**
 * The Astro config every niche exports. `SITE=<id>` picks the site; the build lands in
 * `<repo>/dist/<id>/` so sites build in parallel. Pass `import.meta.url` of the niche's astro.config.
 */
export function defineNicheConfig(nicheConfigUrl: string): AstroUserConfig {
  const nicheDir = dirname(fileURLToPath(nicheConfigUrl));
  const loaded: LoadedSite = loadSite(nicheDir, requireSiteId());
  const outDir = join(loaded.root, "dist", loaded.site.id);

  return {
    site: loaded.site.url,
    root: nicheDir,
    srcDir: ".",
    publicDir: "./public",
    outDir,
    // One cache per site: parallel builds in a niche otherwise race on node_modules/.astro/data-store.json.
    cacheDir: join(loaded.root, ".cache", "astro", loaded.site.id),
    output: "static",
    adapter: cloudflare({
      imageService: "compile",
    }),
    integrations: [
      leadGenIntegration(),
      sitemap({
        filter: (page) => {
          const path = new URL(page).pathname;
          return !path.endsWith("/robots.txt") && !loaded.niche.sitemapExclude.includes(path);
        },
      }),
    ],
    compressHTML: true,
    build: {
      inlineStylesheets: "always",
    },
    vite: {
      plugins: [virtualModulesPlugin(loaded), tailwindcss()],
    },
  };
}
