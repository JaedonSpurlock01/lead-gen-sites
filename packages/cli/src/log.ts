export type Logger = {
  log(line: string): void;
  warn(line: string): void;
  error(line: string): void;
};

export const consoleLogger: Logger = {
  log: (line) => console.log(line),
  warn: (line) => console.warn(`warning: ${line}`),
  error: (line) => console.error(`error: ${line}`),
};

/** Collects output for tests. */
export function memoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    log: (line) => lines.push(line),
    warn: (line) => lines.push(`warning: ${line}`),
    error: (line) => lines.push(`error: ${line}`),
  };
}

export class CliError extends Error {
  constructor(message: string, public readonly exitCode = 1) {
    super(message);
    this.name = "CliError";
  }
}
