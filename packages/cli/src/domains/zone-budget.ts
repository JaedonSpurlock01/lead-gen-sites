import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Remembers when this repo created zones so the 25-per-10-minutes limit holds across runs.
 * `reserve` waits for a free slot (when `wait` is allowed) or reports how long until one opens.
 */
export class ZoneCreationBudget {
  private readonly file: string;
  private stamps: number[];

  constructor(
    root: string,
    private readonly perWindow: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.file = join(root, ".cache", "domains", "zone-creations.json");
    this.stamps = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as number[]) : [];
  }

  private recent(): number[] {
    const cutoff = this.now() - this.windowMs;
    return this.stamps.filter((stamp) => stamp > cutoff).sort((a, b) => a - b);
  }

  /** Milliseconds until another zone may be created (0 when a slot is free). */
  waitMs(): number {
    const recent = this.recent();
    if (recent.length < this.perWindow) return 0;
    return (recent[recent.length - this.perWindow] as number) + this.windowMs - this.now();
  }

  used(): number {
    return this.recent().length;
  }

  record(): void {
    this.stamps = [...this.recent(), this.now()];
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(this.stamps)}\n`);
  }
}
