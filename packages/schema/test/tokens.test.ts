import { describe, expect, it } from "vitest";
import { resolveSite, siteSchema } from "../src/site";
import { TokenError, applyTokens, applyTokensDeep, findTokens, tokenContext } from "../src/tokens";
import { siteFixture } from "./fixtures";

const context = tokenContext(resolveSite(siteSchema.parse(siteFixture), "asphalt-paving"));

describe("tokens", () => {
  it("resolves flat and dotted tokens", () => {
    expect(applyTokens("Paving in {{city}} for {{ market.climateLabel }} at {{url}}", context)).toBe(
      "Paving in Blackfoot for Snake River Plain freeze-thaw at https://asphaltpavingblackfoot.com",
    );
  });

  it("throws listing every unknown token once", () => {
    expect(() => applyTokens("{{nope}} and {{nope}} and {{business.zip}}", context)).toThrow(TokenError);
    try {
      applyTokens("{{nope}} and {{business.zip}}", context);
    } catch (error) {
      expect((error as TokenError).tokens).toEqual(["nope", "business.zip"]);
    }
  });

  it("applies tokens deep inside objects and arrays", () => {
    const copy = { faqs: [{ question: "Cost in {{city}}?", answer: "Season: {{pavingSeason}}." }] };
    expect(applyTokensDeep(copy, context)).toEqual({
      faqs: [{ question: "Cost in Blackfoot?", answer: "Season: late spring through early fall." }],
    });
  });

  it("lists the tokens a text uses", () => {
    expect(findTokens("{{city}} {{city}} {{market.pavingSeason}}")).toEqual(["city", "market.pavingSeason"]);
  });
});
