import type { SiteRef } from "../targets";

export type CheckLine = { name: string; ok: boolean; detail: string };
export type DomainCheckResult = { ref: SiteRef; domain: string; ok: boolean; checks: CheckLine[] };

export type HttpCheckOptions = {
  fetch?: typeof fetch;
  /** Also POST a test lead to /api/lead. Off by default so real leads are not spammed. */
  withLead?: boolean;
  timeoutMs?: number;
};

async function get(fetchImpl: typeof fetch, url: string, timeoutMs: number, init: RequestInit = {}) {
  return fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Read-only HTTP checks for one site: `/` returns 200 and `www` redirects to the apex.
 * `domains check` (phase 5) adds the zone and certificate checks through the API.
 */
export async function httpChecks(ref: SiteRef, domain: string, options: HttpCheckOptions = {}): Promise<DomainCheckResult> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const checks: CheckLine[] = [];

  try {
    const response = await get(fetchImpl, `https://${domain}/`, timeoutMs);
    checks.push({ name: "root", ok: response.status === 200, detail: `GET https://${domain}/ -> ${response.status}` });
  } catch (error) {
    checks.push({ name: "root", ok: false, detail: `GET https://${domain}/ failed: ${(error as Error).message}` });
  }

  try {
    const response = await get(fetchImpl, `https://www.${domain}/`, timeoutMs);
    const location = response.headers.get("location") ?? "";
    const redirected = [301, 302, 307, 308].includes(response.status) && location.startsWith(`https://${domain}/`);
    checks.push({ name: "www", ok: redirected, detail: `GET https://www.${domain}/ -> ${response.status} ${location}`.trim() });
  } catch (error) {
    checks.push({ name: "www", ok: false, detail: `GET https://www.${domain}/ failed: ${(error as Error).message}` });
  }

  if (options.withLead) {
    try {
      const body = new URLSearchParams({
        name: "Domains Check",
        phone: "(000) 000-0000",
        email: "domains-check@example.com",
        size: "1",
        service: "Other",
      });
      const response = await get(fetchImpl, `https://${domain}/api/lead`, timeoutMs, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", referer: `https://${domain}/contact/` },
        body,
      });
      const location = response.headers.get("location") ?? "";
      const accepted = response.status === 303 && location === "/thank-you";
      checks.push({ name: "lead", ok: accepted, detail: `POST /api/lead -> ${response.status} ${location}`.trim() });
    } catch (error) {
      checks.push({ name: "lead", ok: false, detail: `POST /api/lead failed: ${(error as Error).message}` });
    }
  }

  return { ref, domain, ok: checks.every((check) => check.ok), checks };
}
