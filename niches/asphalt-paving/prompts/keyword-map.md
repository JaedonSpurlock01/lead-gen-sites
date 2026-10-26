# Keyword map: {{city}} asphalt paving

Goal: one keyword map per site, in the same shape as `sites/blackfoot/keyword-map.md` and `sites/st-george/keyword-map.md`. Read both before writing; they are the reference for structure and tone.

## Inputs

- `keywords.md` in this niche: every keyword, its page, US volume and CPC, and its verdict (from the `keyword-research` skill).
- `sites/{{id}}/research.md` (competitor SERP notes, local context, and the "Keyword checks" section for this city).
- The niche services in `niche.json`: driveway paving, parking lots, asphalt roads, repair, sealcoating.

## Rules

- Take keywords from `keywords.md`: its `match` terms, plus `varies` terms marked `match` for this city in research.md. Rank them by the US volume and CPC that file records. Use city-level volume only where research.md cites it.
- One primary keyword per page; secondaries are real variants people search (blacktop, resurfacing, overlay, pothole repair, seal coat), not the city name repeated.
- Use the city's real spellings (for example both "St. George" and "St George" when the business name drops the period).
- List services competitors rank for that we do not offer, under the page they relate to, with "do not claim unless offered".

## Output

`niches/asphalt-paving/sites/{{id}}/keyword-map.md` with: title, research date, intro paragraph, one section per page (`/` and each `/services/<slug>`), "FAQ and conversational coverage" (6–8 questions), and "Local context to preserve".

Done when every page in the site has a primary keyword and the file follows the reference maps' headings.
