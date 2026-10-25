# Review checklist before a site PR

> TEMPLATE: adapt this prompt to the trade. Replace every asphalt-specific example (climate, soil, materials, services, reference sites) with this niche's, then delete this line.

Run through every line for `{{id}}`. Each must be a clear yes; fix and re-check anything that is not.

## Facts and claims
- [ ] Business name, phone (display and E.164), email `info@<domain>`, city, region, coordinates and hours in site.json are the real ones for this site.
- [ ] Every local fact in the copy traces to `research.md`; nothing marked unverified made it into the copy.
- [ ] No invented history, crew size, reviews, awards, warranties, license numbers or prices.
- [ ] Only niche services are claimed (no striping, sweeping or concrete unless the niche offers them).

## Originality
- [ ] No paragraph is copied or lightly reworded from another site in this repo. Spot-check three paragraphs per page against the sibling sites with a quick search.
- [ ] Section headings differ from the sibling sites' headings for the same service.
- [ ] site.json `layout` gives this site a hero/section order that differs from at least the nearest sibling (see niche.json `layout`).

## SEO footprint
- [ ] `outboundLinks` has at most the sibling-link budget, and no sibling it links to links back (`pnpm check` enforces both).
- [ ] Titles ≤ 60 characters; descriptions 140–160 characters; one h1 per page.
- [ ] Keyword map primary keywords appear in each page's h1, title and first paragraph.

## Mechanics
- [ ] `pnpm check {{id}}` passes with no errors.
- [ ] `pnpm build {{id}}` succeeds and `pnpm verify-local {{id}}` passes.
- [ ] Every image in `sites/{{id}}/assets/` is licensed for use and is not a stock photo already used by a sibling site's hero.
- [ ] `pnpm domains provision {{id}}` (dry-run) plan has been read; nothing in it was applied.
