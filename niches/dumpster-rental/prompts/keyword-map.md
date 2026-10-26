# Keyword map: {{city}} dumpster rental

Goal: one keyword map per site, in the same shape as `sites/haines-city/keyword-map.md`. Read it before writing; it is the reference for structure and tone.

## Inputs

- `keywords.md` in this niche: every keyword, its page, US volume and CPC, and its verdict (from the `keyword-research` skill).
- `sites/{{id}}/research.md` (competitor SERP notes, local context, and the "Keyword checks" section for this city).
- The pages in `niche.json`: `/`, the three service pages (residential, construction, commercial dumpster rental), `/dumpster-sizes/`, `/about/` and `/contact/`.

## Rules

- Take keywords from `keywords.md`: its `match` terms, plus `varies` terms marked `match` for this city in research.md. Rank them by the US volume and CPC that file records. Use city-level volume only where research.md cites it.
- One primary keyword per page; secondaries are real variants people search (roll off dumpster, roll-off container, trash dumpster, 20 yard dumpster, dumpster for roofing), not the city name repeated.
- Size terms (10, 15, 20, 30, 40 yard) belong on `/dumpster-sizes/` unless a service page owns a size by project type.
- Use the city's real spellings and any common short form people type.
- List terms competitors rank for that we do not offer (junk removal, portable toilets, same-day delivery, exact prices) under "Keywords intentionally not forced into the site", each with its reason.

## Output

`niches/dumpster-rental/sites/{{id}}/keyword-map.md` with: title, research date, "Method and data limits" (naming `keywords.md` and the DataForSEO checks as the sources), one section per page, "Question and conversational coverage" (6–8 questions), "Keywords intentionally not forced into the site", and "Recommended off-site follow-up".

Done when every page in the site has a primary keyword and the file follows the reference map's headings.
