import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { siteInputHash } from "../src/hash";
import { listAllSites } from "../src/targets";
import { makeFixtureRepo } from "./fixture";

const fixture = makeFixtureRepo();
afterAll(() => fixture.cleanup());

describe("siteInputHash", () => {
  it("changes with the site, the niche, packages, config and the lockfile, but not with sibling sites", () => {
    const [blackfoot, pocatello] = listAllSites(fixture.root);
    const before = siteInputHash(fixture.root, blackfoot!);
    expect(siteInputHash(fixture.root, blackfoot!)).toBe(before);

    appendFileSync(join(pocatello!.siteDir, "keyword-map.md"), "\nsibling change\n");
    expect(siteInputHash(fixture.root, blackfoot!)).toBe(before);

    writeFileSync(join(blackfoot!.siteDir, "wrangler.jsonc"), "{}\n");
    expect(siteInputHash(fixture.root, blackfoot!)).toBe(before);

    appendFileSync(join(blackfoot!.siteDir, "keyword-map.md"), "\nown change\n");
    const afterSite = siteInputHash(fixture.root, blackfoot!);
    expect(afterSite).not.toBe(before);

    appendFileSync(join(blackfoot!.nicheDir, "copy", "shared.yaml"), "\n# niche change\n");
    const afterNiche = siteInputHash(fixture.root, blackfoot!);
    expect(afterNiche).not.toBe(afterSite);

    appendFileSync(join(fixture.root, "packages", "marker.txt"), "x");
    const afterPackages = siteInputHash(fixture.root, blackfoot!);
    expect(afterPackages).not.toBe(afterNiche);

    appendFileSync(join(fixture.root, "pnpm-lock.yaml"), "# bump\n");
    expect(siteInputHash(fixture.root, blackfoot!)).not.toBe(afterPackages);
  });
});
