import type { ResolvedSite } from "./site";

export type TokenContext = Record<string, unknown>;

/**
 * Builds the values `{{tokens}}` resolve against. Business and market fields are available both
 * flat (`{{city}}`, `{{climateLabel}}`) and by path (`{{business.city}}`, `{{market.climateLabel}}`).
 */
export function tokenContext(site: ResolvedSite): TokenContext {
  return {
    ...site.market,
    ...site.business,
    id: site.id,
    niche: site.niche,
    domain: site.domain,
    url: site.url,
    hostname: site.hostname,
    business: site.business,
    market: site.market,
  };
}

const tokenPattern = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;

export class TokenError extends Error {
  constructor(public readonly tokens: string[]) {
    super(`unknown token${tokens.length === 1 ? "" : "s"}: ${tokens.map((token) => `{{${token}}}`).join(", ")}`);
    this.name = "TokenError";
  }
}

function lookup(context: TokenContext, path: string): string | undefined {
  let value: unknown = context;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object" || !(key in (value as object))) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

/** Replaces every `{{token}}` in text. Throws TokenError listing every token it cannot resolve. */
export function applyTokens(text: string, context: TokenContext): string {
  const missing: string[] = [];
  const result = text.replace(tokenPattern, (match, path: string) => {
    const value = lookup(context, path);
    if (value === undefined) {
      missing.push(path);
      return match;
    }
    return value;
  });
  if (missing.length > 0) throw new TokenError([...new Set(missing)]);
  return result;
}

/** Applies tokens to every string inside a JSON-like value, returning a new value of the same shape. */
export function applyTokensDeep<T>(value: T, context: TokenContext): T {
  if (typeof value === "string") return applyTokens(value, context) as T;
  if (Array.isArray(value)) return value.map((item) => applyTokensDeep(item, context)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, applyTokensDeep(item, context)]),
    ) as T;
  }
  return value;
}

/** Lists the tokens a text uses, for `check` and for prompts that document what a template needs. */
export function findTokens(text: string): string[] {
  return [...new Set([...text.matchAll(tokenPattern)].map((match) => match[1] as string))];
}
