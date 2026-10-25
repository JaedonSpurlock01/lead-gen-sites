import { describe, expect, it } from "vitest";
import { resolveSite, siteSchema } from "../src/site";
import { siteFixture } from "./fixtures";

describe("siteSchema", () => {
  it("accepts a complete site and defaults canary to false", () => {
    const site = siteSchema.parse(siteFixture);
    expect(site.canary).toBe(false);
    expect(site.outboundLinks).toHaveLength(1);
  });

  it("derives the URL and hostname from domain", () => {
    const site = resolveSite(siteSchema.parse(siteFixture), "asphalt-paving");
    expect(site.url).toBe("https://asphaltpavingblackfoot.com");
    expect(site.hostname).toBe("asphaltpavingblackfoot.com");
    expect(site.niche).toBe("asphalt-paving");
  });

  it.each([
    ["www.asphaltpavingblackfoot.com", /apex host/],
    ["https://asphaltpavingblackfoot.com", /bare hostname/],
    ["blog.asphaltpavingblackfoot.com", /registrable apex/],
    ["AsphaltPavingBlackfoot.com", /lowercase/],
    ["asphaltpavingblackfoot", /registrable apex|ICANN/],
  ])("rejects domain %s", (domain, message) => {
    const result = siteSchema.safeParse({ ...siteFixture, domain });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message).join("\n")).toMatch(message);
  });

  it("rejects the old business.url, tracerFormsUrl and singular outboundLink keys", () => {
    const stale = {
      ...siteFixture,
      tracerFormsUrl: "https://tracer.example.com/api/forms",
      outboundLink: { href: "https://example.com", text: "x" },
      business: { ...siteFixture.business, url: "https://asphaltpavingblackfoot.com" },
    };
    const result = siteSchema.safeParse(stale);
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join(".")).sort();
    expect(paths).toEqual(["", "business"]);
  });

  it("rejects an invalid Worker name and phone", () => {
    expect(siteSchema.safeParse({ ...siteFixture, cloudflareProject: "Asphalt_Paving" }).success).toBe(false);
    expect(siteSchema.safeParse({ ...siteFixture, cloudflareProject: "-leading" }).success).toBe(false);
    expect(
      siteSchema.safeParse({ ...siteFixture, business: { ...siteFixture.business, phoneTel: "2087827152" } }).success,
    ).toBe(false);
  });

  it("rejects absolute asset paths", () => {
    expect(siteSchema.safeParse({ ...siteFixture, assets: { ...siteFixture.assets, hero: "/abs/hero.jpg" } }).success).toBe(
      false,
    );
  });
});
