import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDomainsCheck } from "../src/domains/check";
import { memoryLogger } from "../src/log";
import { MockCloudflare } from "./cloudflare-mock";
import { makeFixtureRepo } from "./fixture";

let fixture: ReturnType<typeof makeFixtureRepo>;
let cf: MockCloudflare;
beforeEach(() => {
  fixture = makeFixtureRepo();
  cf = new MockCloudflare();
});
afterEach(() => fixture.cleanup());

const sites = [
  ["asphaltpavingblackfoot.com", "asphalt-paving-blackfoot"],
  ["pocatelloasphaltpaving.com", "asphalt-paving-pocatello"],
  ["asphaltpavingstgeorge.com", "asphalt-paving-st-george"],
] as const;

/** HTTP for healthy sites: apex 200, www 301 to the apex. */
const healthyFetch = (broken: string[] = []) =>
  (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (broken.includes(url.hostname)) return new Response("not found", { status: 404 });
    if (url.hostname.startsWith("www.")) return new Response(null, { status: 301, headers: { location: `https://${url.hostname.slice(4)}${url.pathname}` } });
    return new Response("<html></html>", { status: 200 });
  }) as typeof fetch;

describe("domains check", () => {
  it("passes live sites and only ever reads", async () => {
    for (const [domain, worker] of sites) cf.addLiveSite(domain, worker);
    const logger = memoryLogger();
    const results = await runDomainsCheck(fixture.root, "all", { api: cf, accountId: cf.accountId, fetch: healthyFetch(), logger });
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results[0]!.checks.map((check) => check.name)).toEqual(["zone", "certificate", "www certificate", "worker domain", "root", "www"]);
    expect(cf.writes).toEqual([]);
    expect(logger.lines.at(-1)).toBe("domains check summary: 3 passed, 0 failed");
  });

  it("reports a pending zone, a missing certificate, a wrong Worker and a broken www", async () => {
    const zone = cf.addLiveSite("asphaltpavingblackfoot.com", "asphalt-paving-blackfoot");
    zone.status = "pending";
    cf.certs.set(zone.id, [{ id: "c", status: "pending_validation", hosts: ["asphaltpavingblackfoot.com"] }]);
    cf.workerDomains[0]!.service = "some-other-worker";
    const [result] = await runDomainsCheck(fixture.root, "blackfoot", {
      api: cf,
      accountId: cf.accountId,
      fetch: healthyFetch(["www.asphaltpavingblackfoot.com"]),
      logger: memoryLogger(),
    });
    expect(result!.checks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.detail}`)).toEqual([
      "zone: pending; nameservers should be ada.ns.cloudflare.com, bob.ns.cloudflare.com",
      "certificate: no active certificate covering asphaltpavingblackfoot.com (packs: pending_validation)",
      "www certificate: no active certificate covering www.asphaltpavingblackfoot.com",
      "worker domain: asphaltpavingblackfoot.com -> some-other-worker (expected asphalt-paving-blackfoot)",
      "www: GET https://www.asphaltpavingblackfoot.com/ -> 404",
    ]);
  });

  it("runs HTTP checks only without credentials, and posts a lead only with --with-lead", async () => {
    const posted: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(String(input));
        return new Response(null, { status: 303, headers: { location: "/thank-you" } });
      }
      return healthyFetch()(input, init);
    }) as typeof fetch;
    const logger = memoryLogger();
    const plain = await runDomainsCheck(fixture.root, "pocatello", { api: null, fetch: fetchImpl, logger });
    expect(plain[0]!.checks.map((check) => check.name)).toEqual(["root", "www"]);
    expect(logger.lines[0]).toMatch(/skipping zone, certificate and Worker-domain checks/);
    expect(posted).toEqual([]);
    const withLead = await runDomainsCheck(fixture.root, "pocatello", { api: null, fetch: fetchImpl, withLead: true, logger });
    expect(withLead[0]!.checks.map((check) => check.name)).toEqual(["root", "www", "lead"]);
    expect(posted).toEqual(["https://pocatelloasphaltpaving.com/api/lead"]);
  });
});
