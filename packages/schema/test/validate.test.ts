import { describe, expect, it } from "vitest";
import { nicheSchema } from "../src/niche";
import { siteSchema } from "../src/site";
import { validateServicePages, validateSiteForNiche } from "../src/validate";
import { nicheFixture, siteFixture } from "./fixtures";

const niche = nicheSchema.parse(nicheFixture);

describe("validateSiteForNiche", () => {
  it("passes a site that fits its niche", () => {
    expect(validateSiteForNiche(siteSchema.parse(siteFixture), niche)).toEqual([]);
  });

  it("reports missing market fields, missing required assets, unknown keys and uncovered services", () => {
    const { pavingSeason: _p, ...market } = siteFixture.market;
    const { hero: _h, ...assets } = siteFixture.assets;
    const site = siteSchema.parse({
      ...siteFixture,
      market: { ...market, bogus: "x" },
      assets: { ...assets, extra: "assets/x.jpg" },
      serviceOptions: ["Other"],
      layout: { hero: "wide", sections: ["intro", "form", "nope"] },
    });
    expect(validateSiteForNiche(site, niche)).toEqual([
      "market.pavingSeason is required by niche asphalt-paving",
      "market.bogus is not declared in niche.json marketFields",
      "assets.hero is required by niche asphalt-paving",
      "assets.extra is not declared in niche.json imageSlots",
      'serviceOptions is missing "Asphalt Driveway Paving" (service asphalt-driveway-paving)',
      'serviceOptions is missing "Asphalt Repair" (service asphalt-repair)',
      'layout.hero "wide" is not one of default, split',
      'layout.sections entry "nope" is not declared by the niche',
    ]);
  });
});

describe("validateServicePages", () => {
  it("requires one content file per niche service and no extras", () => {
    expect(validateServicePages(["asphalt-driveway-paving", "asphalt-sealcoating"], niche)).toEqual([
      "content/services/asphalt-repair.md is missing",
      "content/services/asphalt-sealcoating.md is not a service in niche.json",
    ]);
    expect(validateServicePages(["asphalt-driveway-paving", "asphalt-repair"], niche)).toEqual([]);
  });
});
