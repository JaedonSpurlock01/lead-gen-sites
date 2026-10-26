# Service page: {{service.nav}} in {{city}}

Goal: one original, locally specific page at `niches/solar-installation/sites/{{id}}/content/services/{{service.slug}}.yaml`. Run this once per service in `niche.json`. The same rules apply to the pages in `content/pages/` (index, about, contact, thank-you, 404).

## Read first

- `sites/{{id}}/research.md` and `sites/{{id}}/keyword-map.md` for this site.
- One live example of the same file, for shape and voice only: `sites/carson-city/content/services/{{service.slug}}.yaml`. Do not reuse its sentences; Google sees these sites side by side.
- `packages/schema/src/blocks.ts` for the block fields. This niche renders the block types listed in niche.json `blocks`.

## File shape

A block page: `title`, `description`, `hero` (`variant` from niche.json `layout.heroVariants`, `breadcrumb`, `eyebrow`, `h1`, `lede`), then `blocks`: an `article` (the service's image slot, 4–5 `sections` of `heading`, `paragraphs` and optional `bullets`, and a `closing` with links), a `faq` of 4–6 questions from the keyword map, and `links`. Text is plain except `[text](href)` links.

## Voice

The live sites read like a careful solar advisor at an eighth-grade reading level: short sentences, plain names for parts (panels, mounts, wiring, inverter, monitoring), and saying what depends on the roof, the system or the utility instead of promising an outcome. Write that way.

- Cover what the service involves, the signs or reasons a customer needs it, what affects the work locally (roof, weather, permit, utility), what affects the estimate, and a closing request with the phone number from site.json.
- Use the local context from research.md at least three times, specifically (a weather fact, the utility or permit path, a roof or property type).
- Primary keyword in h1, title and the first paragraph; secondaries once each where they read naturally. No keyword lists, no "near me" stuffing.
- Never invent savings, production numbers, payback periods, prices, warranties, financing, licenses, certifications, years in business or reviews. State incentives only as research.md records them, with its date. Tell customers to stay off the roof and out of electrical equipment.
- `{{city}}`-style tokens are allowed but write the city name directly when it reads better.

Done when the file parses (`pnpm check {{id}}` passes for it), covers every point above, and contains no sentence copied from another site.
