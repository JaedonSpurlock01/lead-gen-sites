# Local research: solar installation in {{city}}, {{region}}

Goal: a short, sourced brief that the keyword map and every page are written from. It is the only place facts about the city enter the site, so every claim the copy makes later must trace back to a line here.

## Gather

Research the live web for {{city}}, {{regionName}}. For each item, record the fact and the URL it came from. Mark anything you could not confirm as **unverified**; unverified items stay out of the copy.

1. **Sun and weather.** Sunshine and solar resource (NREL PVWatts or NSRDB), snow, hail, high wind, dust, wildfire smoke and pollen, and what they mean for production, roof work and cleaning. NOAA/NWS climate normals or the state climatologist.
2. **Utility and interconnection.** The electric utility serving the city, its interconnection application steps, and how it credits exported power (net metering or net billing). The utility's own pages or the state public utilities commission.
3. **Permits.** The city or county building permit for rooftop solar, plan review, inspections, and any historic-district or design review. HOA solar-access rules only if a state statute or source says so.
4. **Incentives.** The current status of the federal residential clean energy credit (IRS pages only), plus any state or utility rebate in effect today. Record the "as of" date. Competitor pages are often out of date here.
5. **Homes and roofs.** Typical roof types and ages, tile or metal roofs, acreage where ground mounts are common, new subdivisions. Use the city's own neighborhood names only when a source shows them.
6. **Competitor SERP.** Search `solar installation {{city}}`, `solar companies {{city}}`, `solar panel repair {{city}}`, `solar panel cleaning {{city}}`. List what the top local results emphasize and the services they claim. Note services we do not offer (batteries, EV chargers, roofing, financing, leases) so the copy does not claim them.
7. **Keyword checks.** The `keyword-research` skill's site run adds this section; leave space for it.

## Output

Write `niches/solar-installation/sites/{{id}}/research.md`:

- Research date (today) and the sources list.
- `market` values for site.json, matching the style of the live sites:
  - `localContextLabel`: a short noun phrase ("High-desert solar planning").
  - `localContextSummary`: one or two sentences on local climate, utility and permit context.
  - `serviceSeasonality`: one sentence on when consultations and field work happen.
- A "Local context to preserve" list of 4–6 specific facts the pages should use (a weather fact, the utility and its export rule, the permit path, the incentive status with its date, a roof or property type).

Done when every `market` value and every context bullet has a source, and nothing unverified is presented as fact.
