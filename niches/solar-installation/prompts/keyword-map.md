# Keyword map: {{city}} solar installation

Goal: one keyword map per site, in the same shape as `sites/carson-city/keyword-map.md` and `sites/idaho-falls/keyword-map.md`. Read both before writing; they are the reference for structure and tone.

## Inputs

- `keywords.md` in this niche: every keyword, its page, US volume and CPC, and its verdict (from the `keyword-research` skill).
- `sites/{{id}}/research.md` (competitor SERP notes, local context, and the "Keyword checks" section for this city).
- The pages in `niche.json`: `/`, the three service pages (solar panel installation, repair and cleaning), `/about/` and `/contact/`.

## Rules

- Take keywords from `keywords.md`: its `match` terms, plus `varies` terms marked `match` for this city in research.md. Rank them by the US volume and CPC that file records. Use city-level volume only where research.md cites it.
- One primary keyword per page; secondaries are real variants people search (solar installer, solar company, solar contractor, solar inverter repair, solar panel washing), not the city name repeated. Word-order variants share one page.
- Use the city's real spellings and the state both spelled out and abbreviated ("Nevada" and "NV").
- Cost and incentive questions follow research.md's incentive status; never map a page to a credit or rebate that has ended.
- List terms competitors rank for that we do not offer (batteries, EV chargers, roofing, financing, leases) under "Competitor terminology and gaps", with "do not claim unless offered".

## Output

`niches/solar-installation/sites/{{id}}/keyword-map.md` with: title, research date, "Data note" (naming `keywords.md` and the DataForSEO checks as the sources), "Page map" with one section per page, the question sections (cost and estimate; local process, utility and permit; climate and property; conversational and AI searches), "Near-me and map intent", "Competitor terminology and gaps", "Priority sequence" and "Research sources".

Done when every page in the site has a primary keyword and the file follows the reference maps' headings.
