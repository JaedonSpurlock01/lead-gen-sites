---
name: keyword-research
description: Find every keyword people search for a niche and decide which ones belong to it, using DataForSEO. Use when starting a niche, before writing a site's keyword map, or when asked whether a search term (e.g. "driveway repair") matches a niche.
---

# Keyword research

Two runs, both through the `dataforseo` MCP server (`api_request`, `docs_search`):

- **Niche run**, once per niche: builds `niches/<niche>/keywords.md`, the niche's full keyword list with a verdict on each term. Niches do not change, so this file is the long-lived source of truth.
- **Site run**, once per new site: re-tests that file's `varies` terms in the new city and records who holds the map pack. Its notes go into `sites/<id>/research.md`, which `prompts/keyword-map.md` reads.

If `niches/<niche>/keywords.md` is missing, do the niche run before the site run.

## The relevance test

A keyword belongs to the niche when Google answers it with the same businesses. Volume never decides relevance.

For a candidate, fetch the local results in a reference city (one of the niche's existing site cities) and compare them with the niche's **anchor** (its head term, e.g. `asphalt paving`, `dumpster rental`, `solar installation`):

```
POST /v3/serp/google/organic/live/advanced   ($0.002 per call, one task per call)
[{"keyword":"<candidate>","location_name":"<City>,<State>,United States","language_code":"en","depth":10}]
```

Compare the `local_pack` businesses, then the organic domains. Ignore directories and platforms (Yelp, BBB, Yellow Pages, Angi, HomeAdvisor, Thumbtack, YouTube, Facebook, Reddit).

- `match`: at least 2 of the 3 pack businesses also appear for the anchor, or the pack businesses are plainly this trade by name or description.
- `varies`: 1 of 3 overlaps, or the pack mixes trades. Write down the qualified variant that would be a `match` (e.g. "asphalt driveway repair"); `related_searches` usually names it.
- `off-niche`: no overlap and the pack is a different trade. Write down the trade and a `use instead` term.

Example, Blackfoot ID, October 2026: the `asphalt paving` pack was Imperial Asphalt, Klingler Asphalt and Shield Asphalt. The `driveway repair` pack was three concrete companies, the same pack as `concrete driveway`, with no organic overlap. Verdict: `off-niche` (concrete); use instead `asphalt driveway repair`.

Terms that contain the niche's defining word (asphalt, dumpster, solar) are `match` without a test. Spend tests on the generic ones.

## Niche run

1. **Seeds.** Collect the anchor, each service's `nav` and `formValue` from `niche.json`, and the trade's synonyms (blacktop, seal coat, roll-off). Up to 20. Done when every service has a seed.
2. **Expand.** At US level (city volumes in small markets come back as 10 or empty, so they cannot rank terms):
   - `POST /v3/keywords_data/google_ads/keywords_for_keywords/live` with all the seeds in one task, `"location_name":"United States"` ($0.09). This finds synonyms that do not contain the seed words.
   - `POST /v3/dataforseo_labs/google/keyword_suggestions/live`, one call per anchor or service seed, `"location_name":"United States"`, `"limit":300`, `"filters":[["keyword_info.search_volume",">",0]]` (about $0.05 each). This finds long-tail terms.

   Done when both sources have run for every seed.
3. **Sort out non-buyer terms.** Set aside terms that name another city or a brand, and terms about jobs, equipment, materials for sale, or DIY. Move question terms (how much, how long, what is) to the questions list. Done when every remaining term would come from someone ready to hire.
4. **Test.** Run the relevance test on every generic term. Done when every remaining term has a verdict.
5. **Write `niches/<niche>/keywords.md`** in the shape below and stop. Spend at most $1.50 on the niche run. If more tests are needed, list them and ask the owner.

## Site run

1. Read `niches/<niche>/keywords.md`.
2. In the new city, run the relevance test on every `varies` term and on the anchor. The anchor result gives the map-pack competitors: record each one's name, rating, review count and site.
3. Add a "Keyword checks" section to `sites/<id>/research.md` with the date, each verdict for this city, and the competitor pack. Stop at $0.10 for the site run.

Done when every `varies` term has a verdict for this city. Leave `keywords.md` as it is unless a test shows a niche-wide verdict was wrong; then fix it and say so in the PR.

## `keywords.md` shape

```markdown
# <Niche> keywords

Researched: <date>. Reference city for tests: <City, ST>. Volumes and CPC are US monthly, Google Ads and DataForSEO Labs. Cost: $<total>.

## <Page: / or /services/<slug>>

| Keyword | US volume | CPC | Verdict |
|---|---|---|---|
| asphalt paving | 40,500 | $9.10 | match |

## Varies by city

| Keyword | What the reference city showed | Use instead |

## Off-niche

| Keyword | Trade Google shows | Use instead |

## Questions

Question terms and People Also Ask questions, for FAQs.
```

Every `match` and `varies` term sits under exactly one page: the service it buys, or `/` for the general trade terms.

## Response handling

- `api_request` returns a trimmed result by default. Keep that; `noAiMode: true` on a large endpoint can return hundreds of KB.
- `location_name` format is `City,State,United States`. Labs endpoints take country names only.
- Google Ads live endpoints allow 12 requests per minute.
- Add up the cost of each call as you go and report the total.
