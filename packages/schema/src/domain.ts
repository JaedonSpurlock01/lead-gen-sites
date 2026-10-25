import { parse } from "tldts";

export type DomainProblem = "empty" | "scheme-or-path" | "uppercase" | "www" | "invalid-hostname" | "not-icann" | "not-apex";

const problemMessages: Record<DomainProblem, string> = {
  empty: "domain is empty",
  "scheme-or-path": "domain must be a bare hostname (no scheme, path, port, or whitespace)",
  uppercase: "domain must be lowercase",
  www: "domain must be the apex host; www is added as a redirect, never as the canonical domain",
  "invalid-hostname": "domain is not a valid hostname",
  "not-icann": "domain must end in a public ICANN suffix",
  "not-apex": "domain must be a registrable apex (e.g. example.com, not sub.example.com)",
};

/** Returns the first problem with a would-be canonical domain, or null when it is a valid apex host. */
export function domainProblem(value: string): DomainProblem | null {
  if (!value) return "empty";
  if (/[\s/:@?#]/.test(value)) return "scheme-or-path";
  if (value !== value.toLowerCase()) return "uppercase";
  if (value.startsWith("www.")) return "www";
  const parsed = parse(value);
  if (!parsed.hostname || parsed.isIp) return "invalid-hostname";
  if (!parsed.isIcann) return "not-icann";
  if (parsed.domain !== value) return "not-apex";
  return null;
}

export function describeDomainProblem(problem: DomainProblem): string {
  return problemMessages[problem];
}

export function isApexDomain(value: string): boolean {
  return domainProblem(value) === null;
}

/** The canonical site URL derived from the domain. The only place the scheme is added. */
export function siteUrl(domain: string): string {
  return `https://${domain}`;
}
