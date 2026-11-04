---
name: add-backlink
description: Add an outbound link (backlink) from one of our sites to another domain with a given anchor text, then ship it. Use when asked to add, place or point a backlink or link from a site/domain to another domain, e.g. "link asphaltpavingblackfoot.com to example.com with anchor 'parking lot paving'".
---

# Add a backlink

Turns "link from `<source domain>` to `<target URL>` with anchor `<text>`" into a change on `main` that CI deploys. Links are data: one entry in the source site's `site.json` `outboundLinks`. Code changes only when the niche has no free place to render it.

## 1. Resolve the inputs

- **source site**: find it by domain: `grep -l '"domain": "<domain>"' niches/*/sites/*/site.json`. Not found → stop and ask.
- **target**: `https://` URL with a trailing `/` for a bare domain. Block-page niches drop non-https links silently.
- **anchor**: the exact text the user gave.

If the target is one of our sites (`grep -l '"domain": "<target>"' niches/*/sites/*/site.json`), check that it does not already link back to the source. Sibling links are one-way; `pnpm check` errors on A → B → A. Refuse a link-back and tell the user.

## 2. Place the link

How a link reaches the page depends on the niche:

- **asphalt-paving** (Markdown services): home-page components render `outboundLinks` **by position**. Each slot has fallback text that the anchor replaces, so the anchor must read naturally in that sentence:
  - `[0]`: `components/home/WhyUs.astro`, "…on every {city} ___ project". Fallback "asphalt paving".
  - `[1]`: `components/home/Services.astro`, "{city} ___ starts with the surface you have". Fallback "asphalt paving".
  - `[2]`: `components/home/Services.astro`, "…driveway paving, ___, pothole repair…". Fallback "parking lot paving".
  Append the link at the first free index whose sentence fits the anchor. If no free slot fits, add a new slot in a home component: `outboundLinks[n] ? <a …> : "<fallback>"`, same classes and `target="_blank" rel="noopener noreferrer"`, with the fallback matching the old copy word for word so other sites render unchanged. Add the new slot to this list.
- **dumpster-rental, solar-installation** (block pages): give the link an `id` (a slug) and put `{{outbound:<id>}}` in a sentence in the site's `content/pages/*.yaml` or `content/services/*.yaml` where the anchor reads naturally. An unused id renders nothing.
- **any other niche**: grep its `components/` and `pages/` for `outboundLinks` and `outbound:` to find how it renders links, and follow that pattern.

Keep `site.json` formatting: 2-space JSON, trailing newline.

## 3. Verify

```
pnpm check && pnpm typecheck && pnpm test
pnpm build <source-id>
grep -A2 '<target host>' dist/<source-id>/index.html   # or the page you used
```

If you changed a niche component, also build one other site in that niche and confirm its sentence is unchanged. JSX line breaks around `{…}` collapse to one space, so look out for doubled spaces or a space before a comma.

Done when the anchor appears as an `<a>` to the target in the built HTML, reads as a normal sentence, and `pnpm check` shows no sibling-link warning (budget in `config/cloudflare.json` `seo.outboundSiblingLinksWarnAt`).

## 4. Ship

Commit on a branch `links/<source-id>-<target-slug>`, push, and open a PR with `gh pr create`. CI deploys from `main` (`.github/workflows/deploy.yml`, target from `pnpm affected`). A `site.json` change redeploys one site; a niche component change redeploys every site in that niche.

Merge (`gh pr merge --squash --delete-branch`) only when the user asked for the link to be deployed. Then watch the run with `gh run list --workflow Deploy --limit 1` / `gh run watch <id> --exit-status` and report the result. Never run `pnpm run deploy --apply` or `wrangler deploy` yourself.
