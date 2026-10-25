import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryLogger } from "../src/log";
import type { Runner } from "../src/runner";
import { runSecretsRotate } from "../src/secrets";
import { makeFixtureRepo } from "./fixture";

let fixture: ReturnType<typeof makeFixtureRepo>;
beforeEach(() => {
  fixture = makeFixtureRepo();
});
afterEach(() => fixture.cleanup());

function fakeWrangler(script: Record<string, ("ok" | "429" | "fail")[]> = {}) {
  const calls: { args: string[]; input?: string }[] = [];
  const attempts = new Map<string, number>();
  const runner: Runner = async (_command, args, options) => {
    calls.push({ args, input: options?.input });
    const worker = args[args.indexOf("--name") + 1] ?? "";
    const n = (attempts.get(worker) ?? 0) + 1;
    attempts.set(worker, n);
    const outcome = script[worker]?.[n - 1] ?? "ok";
    if (outcome === "429") return { code: 1, stdout: "", stderr: "429 Too Many Requests" };
    if (outcome === "fail") return { code: 1, stdout: "", stderr: `✘ [ERROR] no such Worker ${worker}` };
    return { code: 0, stdout: "✨ Success! Uploaded secret", stderr: "" };
  };
  return Object.assign(runner, { calls });
}

describe("runSecretsRotate", () => {
  it("dry-run lists every Worker without calling wrangler or printing the value", async () => {
    const runner = fakeWrangler();
    const logger = memoryLogger();
    const result = await runSecretsRotate(fixture.root, "TRACER_FORM_KEY", { value: "s3cret-value\n", logger, runner });
    expect(result.ok).toBe(true);
    expect(runner.calls).toHaveLength(0);
    const text = logger.lines.join("\n");
    expect(text).toContain("wrangler secret put TRACER_FORM_KEY --name asphalt-paving-blackfoot < (stdin)");
    expect(text).toContain("value: 12 characters (never printed)");
    expect(text).not.toContain("s3cret");
  });

  it("apply pipes the value to wrangler for every Worker, retries 429s and records failures", async () => {
    const runner = fakeWrangler({ "asphalt-paving-pocatello": ["429", "ok"], "asphalt-paving-st-george": ["fail"] });
    const logger = memoryLogger();
    const sleeps: number[] = [];
    const result = await runSecretsRotate(fixture.root, "TRACER_FORM_KEY", {
      value: "s3cret-value",
      apply: true,
      logger,
      runner,
      concurrency: 1,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result.ok).toBe(false);
    expect(runner.calls.map((call) => call.args.join(" "))).toEqual([
      "secret put TRACER_FORM_KEY --name asphalt-paving-blackfoot",
      "secret put TRACER_FORM_KEY --name asphalt-paving-pocatello",
      "secret put TRACER_FORM_KEY --name asphalt-paving-pocatello",
      "secret put TRACER_FORM_KEY --name asphalt-paving-st-george",
    ]);
    expect(runner.calls.every((call) => call.input === "s3cret-value\n")).toBe(true);
    expect(sleeps).toEqual([60_000]);
    expect(logger.lines.join("\n")).not.toContain("s3cret");
    expect(logger.lines).toContain("Rotate summary: 2 succeeded, 1 failed");
    expect(JSON.parse(readFileSync(join(fixture.root, ".cache/secrets/failed.json"), "utf8")).sites).toEqual(["asphalt-paving/st-george"]);

    const retry = await runSecretsRotate(fixture.root, "TRACER_FORM_KEY", { value: "s3cret-value", apply: true, retryFailed: true, logger, runner: fakeWrangler() });
    expect(retry.results.map((entry) => entry.worker)).toEqual(["asphalt-paving-st-george"]);
    expect(retry.ok).toBe(true);
  });

  it("rejects bad names and empty values", async () => {
    await expect(runSecretsRotate(fixture.root, "tracer-key", { value: "x", logger: memoryLogger() })).rejects.toThrow(/UPPER_SNAKE_CASE/);
    await expect(runSecretsRotate(fixture.root, "TRACER_FORM_KEY", { value: "  \n", logger: memoryLogger() })).rejects.toThrow(/no secret value/);
  });
});
