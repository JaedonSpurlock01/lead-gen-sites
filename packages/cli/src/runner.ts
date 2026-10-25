import { spawn } from "node:child_process";

export type RunResult = { code: number; stdout: string; stderr: string };
export type RunOptions = { cwd?: string; env?: NodeJS.ProcessEnv; input?: string };
/** Runs a command. Injected into every command so tests can replace Wrangler and Astro. */
export type Runner = (command: string, args: string[], options?: RunOptions) => Promise<RunResult>;

export const spawnRunner: Runner = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (options.input !== undefined) child.stdin.write(options.input);
    child.stdin.end();
  });

/** Cloudflare answers 429 for five minutes once a token exceeds 1,200 requests per five minutes. */
export function looksRateLimited(text: string): boolean {
  return /\b429\b|too many requests|rate limit/i.test(text);
}

/** The last few meaningful lines of a failed command, for summaries. */
export function tail(text: string, lines = 6): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-lines)
    .join("\n");
}
