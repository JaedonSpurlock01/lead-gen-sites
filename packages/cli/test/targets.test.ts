import { afterAll, describe, expect, it } from "vitest";
import { resolveTargets, refKey } from "../src/targets";
import { makeFixtureRepo } from "./fixture";

const fixture = makeFixtureRepo();
afterAll(() => fixture.cleanup());

describe("resolveTargets", () => {
  it("resolves all, a niche, a site and niche/site", () => {
    expect(resolveTargets(fixture.root, "all").map(refKey)).toEqual(["asphalt-paving/blackfoot", "asphalt-paving/pocatello", "asphalt-paving/st-george"]);
    expect(resolveTargets(fixture.root, undefined)).toHaveLength(3);
    expect(resolveTargets(fixture.root, "asphalt-paving")).toHaveLength(3);
    expect(resolveTargets(fixture.root, "st-george").map(refKey)).toEqual(["asphalt-paving/st-george"]);
    expect(resolveTargets(fixture.root, "asphalt-paving/pocatello").map(refKey)).toEqual(["asphalt-paving/pocatello"]);
    expect(() => resolveTargets(fixture.root, "roofing")).toThrow(/no niche or site/);
    expect(() => resolveTargets(fixture.root, "asphalt-paving/nope")).toThrow(/no site/);
  });
});
