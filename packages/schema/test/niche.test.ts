import { describe, expect, it } from "vitest";
import { nicheSchema } from "../src/niche";
import { nicheFixture } from "./fixtures";

describe("nicheSchema", () => {
  it("accepts the fixture and applies defaults", () => {
    const niche = nicheSchema.parse(nicheFixture);
    expect(niche.extraServiceOptions).toEqual(["Other"]);
    expect(niche.imageSlots.find((slot) => slot.name === "favicon")?.required).toBe(false);
    expect(niche.imageSlots.find((slot) => slot.name === "hero")?.required).toBe(true);
    expect(niche.placeholderPatterns.length).toBeGreaterThan(0);
  });

  it("defaults layout when omitted", () => {
    const { layout: _layout, ...rest } = nicheFixture;
    expect(nicheSchema.parse(rest).layout).toEqual({ heroVariants: ["default"], sections: [], optionalSections: [] });
  });

  it("rejects bad theme colors and schema.org types", () => {
    expect(nicheSchema.safeParse({ ...nicheFixture, schemaOrgType: "paving contractor" }).success).toBe(false);
    expect(
      nicheSchema.safeParse({ ...nicheFixture, theme: { colors: { ...nicheFixture.theme.colors, ink: "beige" }, themeColor: "#000" } }).success,
    ).toBe(false);
    expect(
      nicheSchema.safeParse({ ...nicheFixture, blocks: ["not-a-block"] }).success,
    ).toBe(false);
  });
});
