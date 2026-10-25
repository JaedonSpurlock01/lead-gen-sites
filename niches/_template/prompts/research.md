# Local research: <niche name> in {{city}}, {{region}}

> TEMPLATE: adapt this prompt to the trade. Replace every asphalt-specific example (climate, soil, materials, services, reference sites) with this niche's, then delete this line.

Goal: a short, sourced brief that the keyword map and every service page are written from. It is the only place facts about the city enter the site, so every claim the copy makes later must trace back to a line here.

## Gather

Research the live web for {{city}}, {{regionName}}. For each item, record the fact and the URL it came from. Mark anything you could not confirm as **unverified**; unverified items stay out of the copy.

1. **Climate that affects pavement.** Winter lows and freeze-thaw cycles, summer highs and UV, annual precipitation and how it arrives (snow, monsoon cloudbursts, spring melt), elevation. Prefer NOAA/NWS climate normals or the state climatologist.
2. **Paving season.** When hot-mix plants in the area run and when placement and compaction are realistic. State DOT or local paving-industry sources beat guesses.
3. **Soil and drainage.** Expansive clay, caliche, volcanic or sandy soils, irrigation ditches and overspray, flood or wash areas. County soil survey or extension office.
4. **What gets paved locally.** Typical housing (older grid streets, new subdivisions, rural lots), farm and ranch approaches, private lanes, HOAs, commercial strips. Use the city's own neighborhood names only when a source shows them.
5. **Competitor SERP.** Search `<niche name> {{city}}`, `driveway paving {{city}}`, `parking lot paving {{city}}`, `asphalt repair {{city}}`, `sealcoating {{city}}`. List what the top local results emphasize and which services they claim. Note services we do not offer (striping, sweeping) so the copy does not claim them.
6. **Regulations worth a sentence.** Right-of-way or approach permits for driveway aprons, HOA approval norms. Only if a source says so.

## Output

Write `niches/<niche-id>/sites/{{id}}/research.md`:

- Research date (today) and the sources list.
- `market` values for site.json, each one sentence or phrase, matching the style of the live sites:
  - `climateLabel`: a short noun phrase used inside sentences ("Snake River Plain freeze-thaw", "southern Utah desert heat").
  - `climateSummary`: one sentence on how local weather attacks pavement, ending in what makes drainage/base/sealing critical.
  - `pavingSeason`: a phrase that completes "workable paving conditions cover …".
- A "Local context to preserve" list of 4–6 specific facts the service pages should use.

Done when every `market` value and every context bullet has a source, and nothing unverified is presented as fact.
