# Service page: {{service.nav}} in {{city}}

Goal: one original, locally specific page at `niches/asphalt-paving/sites/{{id}}/content/services/{{service.slug}}.md`. Run this once per service in `niche.json`.

## Read first

- `sites/{{id}}/research.md` and `sites/{{id}}/keyword-map.md` for this site.
- One live example of the same service, for shape and voice only: `sites/blackfoot/content/services/{{service.slug}}.md`. Do not reuse its sentences; Google sees these sites side by side.

## File format

```markdown
---
title: <≤ 60 chars, primary keyword + city>
description: <140–160 chars, plain, specific, no phone number>
h1: <primary keyword phrased for people, includes city and state or region>
---

## <section heading>

<paragraph>

<paragraph>

- <bullet>
- <bullet>
```

The body is `## ` sections; blank lines separate paragraphs; a block of `- ` lines is the section's bullet list. Text is plain: no Markdown links, bold or HTML. `nav` and `formValue` come from niche.json, never from this file.

## Voice

The live sites read like an honest estimator: short declarative sentences, concrete materials and failure modes (base, drainage, compaction, alligator cracking, cure time), and saying when the customer does not need the expensive option. Write that way.

- Four sections, in this order: what the service covers here; why it matters locally (with a 4-bullet list); how the job runs, step by step; a closing call to action naming the phone number from site.json and pointing to related service pages by name.
- Use the local context from research.md at least three times, specifically (a climate fact, a soil or drainage fact, a property type).
- Primary keyword in h1, title and the first paragraph; secondaries once each where they read naturally. No keyword lists, no "near me" stuffing.
- Never invent years in business, crew size, reviews, awards, warranties, licenses numbers or prices. No superlatives you cannot back ("best in {{city}}").
- `{{city}}`-style tokens are allowed but write the city name directly when it reads better.

Done when the file parses (`pnpm check {{id}}` passes for it), covers all four sections, and contains no sentence copied from another site.
