import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBuild } from "../src/build";
import { memoryLogger } from "../src/log";
import type { Runner } from "../src/runner";
import { makeFixtureRepo } from "./fixture";

let fixture: ReturnType<typeof makeFixtureRepo>;
beforeEach(() => {
  fixture = makeFixtureRepo();
});
afterEach(() => fixture.cleanup());

/** Pretends to be `astro build`: writes dist/<SITE>/index.html. */
function fakeAstro(root: string, fail: string[] = []): Runner & { calls: string[] } {
  const calls: string[] = [];
  const runner: Runner = async (command, args, options) => {
    const site = options?.env?.SITE ?? "?";
    calls.push(`${command.split("/").slice(-3).join("/")} ${args.join(" ")} SITE=${site} cwd=${options?.cwd?.split("/").slice(-2).join("/")}`);
    if (fail.includes(site)) return { code: 1, stdout: "", stderr: "✗ Build failed\nsomething broke" };
    mkdirSync(join(root, "dist", site), { recursive: true });
    writeFileSync(join(root, "dist", site, "index.html"), `<html>${site}</html>`);
    return { code: 0, stdout: "built", stderr: "" };
  };
  return Object.assign(runner, { calls });
}

describe("runBuild", () => {
  it("writes wrangler.jsonc, builds every site once, then skips unchanged inputs", async () => {
    const runner = fakeAstro(fixture.root);
    const logger = memoryLogger();
    const first = await runBuild(fixture.root, "all", { logger, runner, concurrency: 2 });
    expect(first.map((result) => result.status)).toEqual(["built", "built", "built"]);
    expect(runner.calls).toHaveLength(3);
    expect(runner.calls[0]).toMatch(/node_modules\/\.bin\/astro build SITE=blackfoot cwd=niches\/asphalt-paving/);
    const wrangler = JSON.parse(readFileSync(join(fixture.root, "niches/asphalt-paving/sites/blackfoot/wrangler.jsonc"), "utf8").replace(/^\/\/.*\n/, ""));
    expect(wrangler.name).toBe("asphalt-paving-blackfoot");
    expect(wrangler.vars.TRACER_FORMS_URL).toMatch(/^https:\/\//);
    expect(existsSync(join(fixture.root, ".cache/build/blackfoot.json"))).toBe(true);
    expect(logger.lines.at(-1)).toBe("build summary: 3 built, 0 skipped, 0 failed");

    const second = await runBuild(fixture.root, "all", { logger, runner });
    expect(second.map((result) => result.status)).toEqual(["skipped", "skipped", "skipped"]);
    expect(runner.calls).toHaveLength(3);

    appendFileSync(join(fixture.root, "niches/asphalt-paving/sites/st-george/keyword-map.md"), "\nedit\n");
    const third = await runBuild(fixture.root, "all", { logger, runner });
    expect(third.map((result) => `${result.ref.id}:${result.status}`)).toEqual(["blackfoot:skipped", "pocatello:skipped", "st-george:built"]);

    const forced = await runBuild(fixture.root, "pocatello", { logger, runner, force: true });
    expect(forced.map((result) => result.status)).toEqual(["built"]);
  });

  it("reports failed builds with the tail of the output and does not cache them", async () => {
    const runner = fakeAstro(fixture.root, ["pocatello"]);
    const logger = memoryLogger();
    const results = await runBuild(fixture.root, "all", { logger, runner });
    expect(results.map((result) => `${result.ref.id}:${result.status}`)).toEqual(["blackfoot:built", "pocatello:failed", "st-george:built"]);
    expect(results[1]?.message).toMatch(/astro build failed \(exit 1\):\n.*something broke/s);
    expect(existsSync(join(fixture.root, ".cache/build/pocatello.json"))).toBe(false);
    expect(logger.lines.at(-1)).toBe("build summary: 2 built, 0 skipped, 1 failed");
  });

  it("uses the requested Tracer environment", async () => {
    const runner = fakeAstro(fixture.root);
    const logger = memoryLogger();
    await runBuild(fixture.root, "blackfoot", { logger, runner, env: "staging" });
    expect(logger.lines[0]).toMatch(/^environment: staging/);
    await expect(runBuild(fixture.root, "blackfoot", { logger, runner, env: "nope" })).rejects.toThrow(/unknown environment "nope"/);
    vi.restoreAllMocks();
  });
});
