# Service page: {{service.nav}} in {{city}}

Goal: one original, locally specific page at `niches/dumpster-rental/sites/{{id}}/content/services/{{service.slug}}.yaml`. Run this once per service in `niche.json`. The same rules apply to the pages in `content/pages/` (index, about, dumpster-sizes, contact, thank-you, 404).

## Read first

- `sites/{{id}}/research.md` and `sites/{{id}}/keyword-map.md` for this site.
- One live example of the same file, for shape and voice only: `sites/haines-city/content/services/{{service.slug}}.yaml`. Do not reuse its sentences; Google sees these sites side by side.
- `packages/schema/src/blocks.ts` for the block fields. This niche renders the block types listed in niche.json `blocks`.

## File shape

A block page: `title`, `description`, `jsonLd` (a `Service` with `provider` `{"@id": "{{url}}/#business"}` and `areaServed` the city), `hero` (`variant` from niche.json `layout.heroVariants`, `h1`, `lede`, the service's image slot), then `blocks`. The reference uses prose, cards, columns, steps, prose, cta; keep a similar weight but vary the order and headings from the sibling site. Text is plain except `[text](href)` links.

## Voice

The live site reads like a dispatcher who wants the job to go smoothly: plain sentences, practical detail (placement, access, fill line, overweight loads, restricted items), and saying when a smaller container or a different service fits better. Write that way.

- Cover what the service handles here, which projects it fits, placement and loading, what stays out of the container, how a rental runs from booking to pickup, and a closing call to action with the phone number from site.json and links to the related pages.
- Use the local context from research.md at least three times, specifically (the disposal facility or its rules, a placement rule, a weather pattern or project type).
- Primary keyword in h1, title and the first paragraph; secondaries once each where they read naturally. No keyword lists, no "near me" stuffing.
- Never invent sizes in stock, dimensions, weight limits, rental days, prices, delivery times (same-day, next-day), years in business, reviews, licenses or insurance. Describe sizes as common categories and ask the customer to confirm. No superlatives you cannot back ("best in {{city}}").
- `{{city}}`-style tokens are allowed but write the city name directly when it reads better.

Done when the file parses (`pnpm check {{id}}` passes for it), covers every point above, and contains no sentence copied from another site.
