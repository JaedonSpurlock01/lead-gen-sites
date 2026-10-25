import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSite } from "@lead-gen/engine/load";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheck } from "../src/check";
import { memoryLogger } from "../src/log";
import { displayPhone, runNewSite } from "../src/new-site";
import { makeFixtureRepo } from "./fixture";

let fixture: ReturnType<typeof makeFixtureRepo>;
beforeEach(() => {
  fixture = makeFixtureRepo();
});
afterEach(() => fixture.cleanup());

describe("runNewSite", () => {
  it("copies the template, fills in identity fields, and leaves placeholders for check to catch", () => {
    const logger = memoryLogger();
    const siteDir = runNewSite(fixture.root, "asphalt-paving", "idaho-falls", {
      domain: "idahofallsasphaltpaving.com",
      name: "Idaho Falls Asphalt Paving",
      city: "Idaho Falls",
      phone: "+12085550100",
      logger,
    });
    expect(existsSync(join(siteDir, "content/services/asphalt-repair.md"))).toBe(true);
    const site = JSON.parse(readFileSync(join(siteDir, "site.json"), "utf8"));
    expect(site).toMatchObject({
      id: "idaho-falls",
      domain: "idahofallsasphaltpaving.com",
      cloudflareProject: "asphalt-paving-idaho-falls",
      canary: false,
      business: {
        name: "Idaho Falls Asphalt Paving",
        email: "info@idahofallsasphaltpaving.com",
        city: "Idaho Falls",
        serviceAreaLabel: "Idaho Falls, Idaho",
        phoneTel: "+12085550100",
        phoneDisplay: "(208) 555-0100",
      },
    });
    const loaded = loadSite(join(fixture.root, "niches/asphalt-paving"), "idaho-falls");
    expect(loaded.services[0]?.h1).toBe("Asphalt Driveway Paving in Idaho Falls");
    expect(readFileSync(join(siteDir, "keyword-map.md"), "utf8")).toMatch(/^# Idaho Falls asphalt paving keyword map/);
    expect(logger.lines[0]).toMatch(/created niches\/asphalt-paving\/sites\/idaho-falls/);

    const report = runCheck(fixture.root, "idaho-falls", memoryLogger());
    expect(report.ok).toBe(false);
    expect(report.issues.filter((issue) => issue.level === "error").every((issue) => /placeholder text/.test(issue.message))).toBe(true);
  });

  it("refuses duplicates and bad input", () => {
    const logger = memoryLogger();
    expect(() => runNewSite(fixture.root, "asphalt-paving", "pocatello", { domain: "x.com", logger })).toThrow(/already exists/);
    expect(() => runNewSite(fixture.root, "asphalt-paving", "twin-falls", { domain: "www.twinfalls.com", logger })).toThrow(/apex host/);
    expect(() => runNewSite(fixture.root, "asphalt-paving", "twin-falls", { domain: "pocatelloasphaltpaving.com", logger })).toThrow(/already used/);
    expect(() => runNewSite(fixture.root, "asphalt-paving", "Twin Falls", { domain: "twinfalls.com", logger })).toThrow(/site id/);
    expect(() => runNewSite(fixture.root, "roofing", "twin-falls", { domain: "twinfalls.com", logger })).toThrow(/no niche/);
  });

  it("formats US phone numbers for display", () => {
    expect(displayPhone("+12085550100")).toBe("(208) 555-0100");
    expect(displayPhone("+442071234567")).toBe("+442071234567");
  });
});
