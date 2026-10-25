import { describe, expect, it } from "vitest";
import { runBatched, type BatchEvent } from "../src/batch";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("runBatched", () => {
  it("never runs more than `concurrency` tasks at once and keeps input order", async () => {
    let running = 0;
    let peak = 0;
    const results = await runBatched(
      [1, 2, 3, 4, 5, 6, 7],
      async (item) => {
        running += 1;
        peak = Math.max(peak, running);
        await tick();
        await tick();
        running -= 1;
        return { ok: item !== 4, message: `item ${item}` };
      },
      { concurrency: 3 },
    );
    expect(peak).toBe(3);
    expect(results.map((result) => result.item)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(results.map((result) => result.ok)).toEqual([true, true, true, false, true, true, true]);
    expect(results[3]?.message).toBe("item 4");
  });

  it("pauses every worker on a rate limit, backs off exponentially, and retries the item", async () => {
    const sleeps: number[] = [];
    const events: BatchEvent<string>[] = [];
    let hits = 0;
    const started: string[] = [];
    const results = await runBatched(
      ["a", "b", "c", "d"],
      async (item, attempt) => {
        started.push(`${item}#${attempt}`);
        if (item === "b" && attempt <= 2) {
          hits += 1;
          return { ok: false, rateLimited: true, message: "429 Too Many Requests" };
        }
        return { ok: true };
      },
      {
        concurrency: 2,
        baseDelayMs: 1000,
        maxDelayMs: 3000,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        onEvent: (event) => events.push(event),
      },
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.find((result) => result.item === "b")?.attempts).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);
    expect(events.filter((event) => event.type === "rate-limited").map((event) => (event as { delayMs: number }).delayMs)).toEqual([1000, 2000]);
    // b is retried before the queue moves on.
    expect(started.indexOf("b#2")).toBeLessThan(started.indexOf("d#1"));
    expect(hits).toBe(2);
  });

  it("gives up after maxAttempts and reports the failure", async () => {
    const results = await runBatched(
      ["x"],
      async () => ({ ok: false, rateLimited: true, message: "429" }),
      { concurrency: 1, maxAttempts: 3, sleep: async () => {} },
    );
    expect(results[0]).toMatchObject({ ok: false, attempts: 3, message: "429" });
  });

  it("turns thrown errors into failed results", async () => {
    const results = await runBatched([1], async () => { throw new Error("boom"); }, { concurrency: 1 });
    expect(results[0]).toMatchObject({ ok: false, message: "boom" });
  });
});
