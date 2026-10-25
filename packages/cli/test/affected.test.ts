import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { affectedTargets } from "../src/affected";
import { resolveTargets, refKey } from "../src/targets";
import { makeFixtureRepo } from "./fixture";

const fixture = makeFixtureRepo();
// A second niche so niche-level and cross-niche cases are real.
mkdirSync(join(fixture.root, "niches/roofing/sites/boise"), { recursive: true });
writeFileSync(join(fixture.root, "niches/roofing/niche.json"), "{}");
afterAll(() => fixture.cleanup());

const affected = (...paths: string[]) => affectedTargets(fixture.root, paths).target;

describe("affectedTargets", () => {
  it("deploys everything for shared code, config and dependencies", () => {
    expect(affected("packages/ui/src/Header.astro")).toBe("all");
    expect(affected("README.md", "config/cloudflare.json")).toBe("all");
    expect(affected("pnpm-lock.yaml")).toBe("all");
  });

  it("deploys a whole niche for niche-level changes and one site for site changes", () => {
    expect(affected("niches/asphalt-paving/copy/shared.yaml")).toBe("asphalt-paving");
    expect(affected("niches/asphalt-paving/sites/pocatello/site.json")).toBe("asphalt-paving/pocatello");
    expect(affected("niches/asphalt-paving/sites/pocatello/content/services/asphalt-roads.md", "niches/roofing/sites/boise/site.json")).toBe(
      "asphalt-paving/pocatello,roofing/boise",
    );
    expect(affected("niches/asphalt-paving/pages/index.astro", "niches/asphalt-paving/sites/blackfoot/site.json")).toBe("asphalt-paving");
  });

  it("deploys nothing for templates, docs, workflows and skills", () => {
    expect(affected("niches/_template/niche.json", "niches/asphalt-paving/sites/_template/site.json")).toBe("");
    expect(affected("README.md", ".github/workflows/deploy.yml", ".claude/skills/new-site/SKILL.md", "CLAUDE.md")).toBe("");
    expect(affected("niches/asphalt-paving/sites/deleted-site/site.json")).toBe("");
  });

  it("produces targets that resolveTargets accepts", () => {
    expect(resolveTargets(fixture.root, "asphalt-paving/pocatello,asphalt-paving,st-george").map(refKey)).toEqual([
      "asphalt-paving/pocatello",
      "asphalt-paving/blackfoot",
      "asphalt-paving/st-george",
    ]);
  });
});
