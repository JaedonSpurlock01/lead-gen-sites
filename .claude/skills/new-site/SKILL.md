---
name: new-site
description: Create a new lead-gen site in an existing niche, from `pnpm new-site` through researched copy to a pull request. Use when asked to add, launch or build a site for a city or market, or to add a site to a niche.
---

# New site

Turns "a `<niche>` site for `<city>`" into a pull request with a site that passes every check and reads as original, locally researched work. The site is data only: `site.json`, Markdown content, images, research notes. Code changes belong in a separate task.

You prepare everything up to the PR. The owner buys the domain, applies provisioning, deploys and merges. Every Cloudflare command you run stays in dry-run: run `pnpm domains provision` and `pnpm run deploy` without `--apply`, and leave `wrangler deploy`, `secrets` and DNS to the owner.

## 1. Pin down the inputs

Collect these. Ask the user only for what you cannot find or derive, in one message:

- **niche**: a folder under `niches/` (not `_template`). Read its `niche.json` and `prompts/`.
- **site id**: lowercase city slug, e.g. `twin-falls`. Must be unused across every niche.
- **domain**: the apex the owner bought or will buy, no `www.`.
- **business details**: name, phone (E.164), city, region code and name, coordinates, hours. Phone and hours come from the owner. Never invent them.

Done when every field has a value from the user or a source.

## 2. Create the site

```
git switch -c site/<id>
pnpm new-site <niche> <id> --domain <domain> --name "<name>" --city "<City>" --region <ID> --region-name "<Region>" --phone +1...
```

Then fill in the rest of `site.json`: coordinates, hours, socials (an empty list is fine), and `serviceOptions` covering every service's `formValue` plus `Other`. Pick a `layout` (hero variant and section order from `niche.json`) that differs from the nearest sibling site.

Done when `pnpm check <id>` reports only placeholder-text errors.

## 3. Research

Run `niches/<niche>/prompts/research.md` for the city. Write `sites/<id>/research.md` with sources, and set `market` in `site.json` from it.

Done when every `market` value and every local-context bullet cites a source.

## 4. Keyword map

Do the `keyword-research` site run for the city (it also does the niche run if `niches/<niche>/keywords.md` is missing). Then run `prompts/keyword-map.md` and write `sites/<id>/keyword-map.md`.

Done when every page has a primary keyword.

## 5. Service pages

For each service in `niche.json`, run `prompts/service-page.md` and replace the service's content file with original copy built from the research brief and keyword map. Niches with `serviceContent: "blocks"` use `content/services/<slug>.yaml` plus one `content/pages/<name>.yaml` per page in `niche.json` `pages`; the block types are in `packages/schema/src/blocks.ts`. Write each page fresh. Treat sibling sites as a reference for shape and voice only.

Done when every content file is rewritten, `pnpm check <id>` passes, and no paragraph matches a sibling site. Spot-check with `grep -rF "<distinctive phrase>" niches/<niche>/sites/`.

## 6. Images

Put licensed photos in `sites/<id>/assets/` and point the `site.json` `assets` slots at them. Shared niche images (`../../assets/...`) are a fallback only. If the owner has not supplied photos, keep the fallbacks and list them as a PR follow-up.

## 7. Verify

```
pnpm check <id>
pnpm build <id>
pnpm verify-local <id>
pnpm domains provision <id>      # dry-run; needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
pnpm run deploy <id>                 # dry-run plan only
```

If the Cloudflare credentials are absent, note in the PR that the provision plan still needs a run. Then walk `prompts/review-checklist.md` line by line.

Done when every command above passes (or is noted) and every checklist line is a yes.

## 8. Pull request

Commit the site folder only, push the branch, and open the PR with `gh pr create`. The PR body contains:

- the site, domain and Worker name;
- the dry-run provision plan, or a note that it still needs credentials;
- the checklist results;
- owner follow-ups, in this order: buy the domain with auto-renew on, `pnpm domains provision <id> --apply` and set the nameservers it prints, merge (CI deploys), `pnpm domains check <id>` and one test lead, plus any missing photos or business details.
