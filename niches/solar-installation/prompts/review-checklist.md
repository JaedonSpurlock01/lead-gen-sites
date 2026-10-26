# Review checklist before a site PR

Run through every line for `{{id}}`. Each must be a clear yes; fix and re-check anything that is not.

## Facts and claims
- [ ] Business name, phone (display and E.164), email `info@<domain>`, city, region, coordinates and hours in site.json are the real ones for this site.
- [ ] Every local fact in the copy traces to `research.md`; nothing marked unverified made it into the copy.
- [ ] No invented history, reviews, awards, licenses, certifications, warranties, financing, prices, savings or production numbers.
- [ ] Incentive statements match research.md's current IRS, state and utility sources and its "as of" date; no expired credit is presented as available.
- [ ] Only niche services are claimed (no batteries, EV chargers, roofing or leases unless the owner offers them).

## Originality
- [ ] No paragraph is copied or lightly reworded from another site in this repo. Spot-check three paragraphs per page against the sibling sites with a quick search.
- [ ] Section headings differ from the sibling sites' headings for the same page.
- [ ] site.json `layout` gives this site a hero variant or block order that differs from the nearest sibling.

## SEO footprint
- [ ] `outboundLinks` has at most the sibling-link budget, and no sibling it links to links back (`pnpm check` enforces both).
- [ ] Titles ≤ 60 characters; descriptions 140–160 characters; one h1 per page.
- [ ] Keyword map primary keywords appear in each page's h1, title and first paragraph.
- [ ] FAQ questions come from the keyword map's question sections.

## Mechanics
- [ ] `pnpm check {{id}}` passes with no errors.
- [ ] `pnpm build {{id}}` succeeds and `pnpm verify-local {{id}}` passes.
- [ ] Every image in `sites/{{id}}/assets/` is licensed for use and is not a photo already used by a sibling site's hero.
- [ ] `pnpm domains provision {{id}}` (dry-run) plan has been read; nothing in it was applied.
