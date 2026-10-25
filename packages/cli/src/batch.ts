export type TaskOutcome = { ok: boolean; rateLimited?: boolean; message?: string };

export type BatchResult<T> = { item: T; ok: boolean; attempts: number; message?: string };

export type BatchEvent<T> =
  | { type: "start"; item: T; attempt: number }
  | { type: "done"; item: T; attempt: number; ok: boolean; message?: string }
  | { type: "rate-limited"; item: T; attempt: number; delayMs: number }
  | { type: "give-up"; item: T; attempt: number; message?: string };

export type BatchOptions<T> = {
  /** How many tasks run at once. */
  concurrency: number;
  /** Attempts per item before it is reported as failed (rate-limited attempts included). */
  maxAttempts?: number;
  /** First pause after a 429. Cloudflare blocks the token for up to five minutes, so the default is one minute. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onEvent?: (event: BatchEvent<T>) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `task` over `items` with limited concurrency. When any task reports a rate limit, every
 * worker pauses until the shared backoff (doubling per consecutive hit) elapses, and the item is
 * retried. Results come back in input order.
 */
export async function runBatched<T>(
  items: readonly T[],
  task: (item: T, attempt: number) => Promise<TaskOutcome>,
  options: BatchOptions<T>,
): Promise<BatchResult<T>[]> {
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 60_000;
  const maxDelayMs = options.maxDelayMs ?? 300_000;
  const sleep = options.sleep ?? defaultSleep;
  const emit = options.onEvent ?? (() => {});

  const results: BatchResult<T>[] = items.map((item) => ({ item, ok: false, attempts: 0 }));
  const queue: { index: number; attempt: number }[] = items.map((_, index) => ({ index, attempt: 1 }));

  let gate: Promise<void> | null = null;
  let consecutiveHits = 0;

  const pause = (delayMs: number) => {
    if (!gate) {
      gate = sleep(delayMs).then(() => {
        gate = null;
      });
    }
    return gate;
  };

  const worker = async () => {
    for (;;) {
      if (gate) await gate;
      const next = queue.shift();
      if (!next) return;
      const item = items[next.index] as T;
      emit({ type: "start", item, attempt: next.attempt });
      let outcome: TaskOutcome;
      try {
        outcome = await task(item, next.attempt);
      } catch (error) {
        outcome = { ok: false, message: (error as Error).message };
      }
      const result = results[next.index] as BatchResult<T>;
      result.attempts = next.attempt;
      if (outcome.ok) {
        // A retry that finally succeeds means the limit window has cleared; unrelated successes do not.
        if (next.attempt > 1) consecutiveHits = 0;
        result.ok = true;
        result.message = outcome.message;
        emit({ type: "done", item, attempt: next.attempt, ok: true, message: outcome.message });
        continue;
      }
      if (outcome.rateLimited && next.attempt < maxAttempts) {
        consecutiveHits += 1;
        const delayMs = Math.min(baseDelayMs * 2 ** (consecutiveHits - 1), maxDelayMs);
        emit({ type: "rate-limited", item, attempt: next.attempt, delayMs });
        queue.unshift({ index: next.index, attempt: next.attempt + 1 });
        await pause(delayMs);
        continue;
      }
      result.ok = false;
      result.message = outcome.message;
      emit({ type: outcome.rateLimited ? "give-up" : "done", item, attempt: next.attempt, ok: false, message: outcome.message });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
