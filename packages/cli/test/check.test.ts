import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheck } from "../src/check";
import { memoryLogger } from "../src/log";
import { editConfig, editSite, makeFixtureRepo } from "./fixture";

let fixture: ReturnType<typeof makeFixtureRepo>;
beforeEach(() => {
  fixture = makeFixtureRepo();
});
afterEach(() => fixture.cleanup());

const messages = (report: ReturnType<typeof runCheck>, level?: "error" | "warning") =>
  report.issues.filter((issue) => !level || issue.level === level).map((issue) => `${issue.site ?? "-"}: ${issue.message}`);

describe("runCheck", () => {
  it("passes the ported sites with only the expected warnings", () => {
    const logger = memoryLogger();
    const report = runCheck(fixture.root, "all", logger);
    expect(messages(report, "error")).toEqual([]);
    expect(report.ok).toBe(true);
    expect(messages(report, "warning")).toEqual([
      "-: config/cloudflare.json secretsStore.storeId is still a TODO; deploy --apply will refuse until it is set",
    ]);
    expect(logger.lines).toContain("ok      asphalt-paving/blackfoot");
    expect(logger.lines.at(-1)).toBe("checked 3 sites (3 total): 0 errors, 1 warning");
  });

  it("fails on schema problems, www domains and duplicate domains or Worker names", () => {
    editSite(fixture.root, "pocatello", (site) => {
      site.domain = "www.pocatelloasphaltpaving.com";
    });
    editSite(fixture.root, "st-george", (site) => {
      site.cloudflareProject = "asphalt-paving-blackfoot";
      site.domain = "asphaltpavingblackfoot.com";
    });
    const report = runCheck(fixture.root, "all", memoryLogger());
    expect(report.ok).toBe(false);
    expect(messages(report, "error")).toEqual([
      expect.stringMatching(/pocatello: .*domain: domain must be the apex host/s),
      'asphalt-paving/st-george: domain "asphaltpavingblackfoot.com" is also used by asphalt-paving/blackfoot',
      'asphalt-paving/st-george: Worker name "asphalt-paving-blackfoot" is also used by asphalt-paving/blackfoot',
    ]);
  });

  it("rejects reciprocal sibling links and warns past the sibling-link budget", () => {
    // blackfoot already links to pocatello and st-george; make st-george link back.
    editSite(fixture.root, "st-george", (site) => {
      site.outboundLinks = [{ href: "https://asphaltpavingblackfoot.com/", text: "asphalt paving" }];
    });
    editConfig(fixture.root, "cloudflare.json", (config) => {
      (config.seo as { outboundSiblingLinksWarnAt: number }).outboundSiblingLinksWarnAt = 1;
    });
    const report = runCheck(fixture.root, "all", memoryLogger());
    expect(messages(report, "error")).toEqual([
      "asphalt-paving/blackfoot: links to asphalt-paving/st-george which links back; sibling links must be one-way",
      "asphalt-paving/st-george: links to asphalt-paving/blackfoot which links back; sibling links must be one-way",
    ]);
    expect(messages(report, "warning")).toContainEqual(expect.stringMatching(/blackfoot: links to 2 sibling sites \(budget 1\)/));
  });

  it("flags leftover template placeholder text and missing content", () => {
    editSite(fixture.root, "pocatello", (site) => {
      site.business.phoneDisplay = "(208) 000-0000";
    });
    writeFileSync(join(fixture.root, "niches/asphalt-paving/sites/pocatello/content/services/asphalt-roads.md"), "---\ntitle: T\ndescription: D\nh1: H\n---\n\n## Roads\n\nReplace this template paragraph.\n");
    const report = runCheck(fixture.root, "pocatello", memoryLogger());
    expect(messages(report, "error")).toEqual([
      expect.stringMatching(/pocatello: .*asphalt-roads\.md still has template placeholder text: "Replace this"/),
      expect.stringMatching(/pocatello: .*site\.json still has template placeholder text: "000-0000"/),
    ]);
  });

  it("warns at the Workers budget and errors past the limit", () => {
    editConfig(fixture.root, "cloudflare.json", (config) => {
      config.workersBudget = { limit: 3, warnAt: 2 };
    });
    expect(messages(runCheck(fixture.root, "all", memoryLogger()), "warning")).toContainEqual(
      "-: 3 site Workers; the Workers Paid plan allows 3 per account including non-site Workers such as Tracer. Workers for Platforms is the next step beyond that.",
    );
    editConfig(fixture.root, "cloudflare.json", (config) => {
      config.workersBudget = { limit: 2, warnAt: 1 };
    });
    expect(messages(runCheck(fixture.root, "all", memoryLogger()), "error")).toEqual(["-: 3 site Workers exceed the account limit of 2"]);
  });

  it("only reports the targeted site's own issues but keeps the global ones", () => {
    editSite(fixture.root, "pocatello", (site) => {
      site.business.phoneDisplay = "(208) 000-0000";
    });
    const report = runCheck(fixture.root, "blackfoot", memoryLogger());
    expect(report.ok).toBe(true);
    expect(report.sites.map((ref) => ref.id)).toEqual(["blackfoot"]);
  });
});
