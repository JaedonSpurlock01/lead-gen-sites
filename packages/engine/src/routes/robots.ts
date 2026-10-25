import type { APIRoute } from "astro";
import site from "virtual:site";

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site.url}/sitemap-index.xml\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
