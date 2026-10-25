import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { throttled } from "../src/domains/api";
import { runDomainsProvision, redirectPhase, wwwRedirectRule } from "../src/domains/provision";
import { memoryLogger } from "../src/log";
import { MockCloudflare } from "./cloudflare-mock";
import { editConfig, makeFixtureRepo } from "./fixture";

let fixture: ReturnType<typeof makeFixtureRepo>;
let cf: MockCloudflare;
beforeEach(() => {
  fixture = makeFixtureRepo();
  cf = new MockCloudflare();
});
afterEach(() => fixture.cleanup());

const provision = (target: string, apply = false, extra: Partial<Parameters<typeof runDomainsProvision>[2]> = {}) =>
  runDomainsProvision(fixture.root, target, { api: cf, accountId: cf.accountId, apply, logger: memoryLogger(), sleep: async () => {}, ...extra });

describe("domains provision", () => {
  it("dry-run on an empty account plans the zone and every setting but writes nothing", async () => {
    const [result] = await provision("blackfoot");
    expect(cf.writes).toEqual([]);
    expect(result!.steps.map((step) => `${step.status} ${step.name}`)).toEqual([
      "create zone",
      "manual manual",
      "update setting ssl",
      "update setting always_use_https",
      "update setting min_tls_version",
      "update setting tls_1_3",
      "update setting automatic_https_rewrites",
      "create www record",
      "create redirect rule",
      "manual manual",
    ]);
    expect(result!.steps[0]!.request).toEqual({ method: "POST", path: "/zones", body: { name: "asphaltpavingblackfoot.com", account: { id: "acct123" }, type: "full" } });
    expect(result!.steps.find((step) => step.name === "www record")!.request!.path).toBe("/zones/<new-zone-id>/dns_records");
  });

  it("apply creates everything with the documented request shapes, then a second apply changes nothing", async () => {
    const [first] = await provision("blackfoot", true);
    expect(first!.steps.every((step) => step.status !== "error")).toBe(true);
    const zone = cf.zones[0]!;
    expect(cf.writes.map((request) => `${request.method} ${request.path.replace(zone.id, "Z")}`)).toEqual([
      "POST /zones",
      "PATCH /zones/Z/settings/ssl",
      "PATCH /zones/Z/settings/always_use_https",
      "PATCH /zones/Z/settings/min_tls_version",
      "POST /zones/Z/dns_records",
      "POST /zones/Z/rulesets",
    ]);
    expect(first!.nameServers).toEqual(["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"]);
    expect(cf.dns.get(zone.id)).toMatchObject([{ type: "AAAA", name: "www.asphaltpavingblackfoot.com", content: "100::", proxied: true }]);
    const ruleset = cf.rulesets.get(`${zone.id}:${redirectPhase}`)!;
    expect(ruleset).toMatchObject({ kind: "zone", phase: redirectPhase });
    expect(ruleset.rules[0]).toMatchObject({
      expression: '(http.host eq "www.asphaltpavingblackfoot.com")',
      action: "redirect",
      action_parameters: { from_value: { status_code: 301, target_url: { expression: 'concat("https://asphaltpavingblackfoot.com", http.request.uri.path)' }, preserve_query_string: true } },
    });

    const writesBefore = cf.writes.length;
    const [second] = await provision("blackfoot", true);
    expect(cf.writes.length).toBe(writesBefore);
    expect(second!.steps.filter((step) => step.status === "create" || step.status === "update")).toEqual([]);
  });

  it("fixes only what is missing on a partly configured zone", async () => {
    const zone = cf.addLiveSite("pocatelloasphaltpaving.com", "asphalt-paving-pocatello");
    cf.settings.get(zone.id)!.min_tls_version = "1.0";
    cf.dns.get(zone.id)![0]!.proxied = false;
    cf.rulesets.set(`${zone.id}:${redirectPhase}`, {
      id: "rs-existing",
      phase: redirectPhase,
      kind: "zone",
      name: "existing",
      rules: [{ id: "other", ref: "keep_me", expression: "true", action: "redirect" }],
    });
    await provision("pocatello", true);
    expect(cf.writes.map((request) => `${request.method} ${request.path}`)).toEqual([
      `PATCH /zones/${zone.id}/settings/min_tls_version`,
      `PATCH /zones/${zone.id}/dns_records/${cf.dns.get(zone.id)![0]!.id}`,
      `POST /zones/${zone.id}/rulesets/rs-existing/rules`,
    ]);
    expect(cf.rulesets.get(`${zone.id}:${redirectPhase}`)!.rules.map((rule) => rule.ref)).toEqual(["keep_me", "lead_gen_www_to_apex"]);

    // A hand-edited rule with our ref is corrected in place.
    const rule = cf.rulesets.get(`${zone.id}:${redirectPhase}`)!.rules[1]!;
    rule.action_parameters = { from_value: { status_code: 302, target_url: { value: "https://pocatelloasphaltpaving.com" } } };
    const before = cf.writes.length;
    await provision("pocatello", true);
    expect(cf.writes.slice(before).map((request) => `${request.method} ${request.path}`)).toEqual([`PATCH /zones/${zone.id}/rulesets/rs-existing/rules/${rule.id}`]);
    expect(rule.action_parameters).toEqual(wwwRedirectRule("pocatelloasphaltpaving.com").action_parameters);
  });

  it("does not add a www record while www is a Worker custom domain, and explains the deploy ordering", async () => {
    const zone = cf.addZone("asphaltpavingblackfoot.com", "active");
    cf.workerDomains.push({ hostname: "www.asphaltpavingblackfoot.com", service: "asphalt-paving-blackfoot", zone_id: zone.id });
    const [result] = await provision("blackfoot");
    expect(result!.steps.some((step) => step.name === "www record")).toBe(false);
    expect(result!.steps.find((step) => /custom domain/.test(step.detail))?.detail).toMatch(/re-run `pnpm domains provision` with --apply right after that deploy/);
    expect(result!.steps.find((step) => step.name === "redirect rule")?.status).toBe("create");
  });

  it("keeps the existing proxied record when www is a Worker route", async () => {
    const zone = cf.addZone("asphaltpavingblackfoot.com", "active");
    cf.workerRoutes.set(zone.id, [{ id: "r1", pattern: "www.asphaltpavingblackfoot.com/*", script: "asphalt-paving-blackfoot" }]);
    const [result] = await provision("blackfoot");
    expect(result!.steps.some((step) => step.name === "www record")).toBe(false);
    expect(result!.steps.find((step) => /route/.test(step.detail))?.detail).toMatch(/by route www\.asphaltpavingblackfoot\.com\/\*/);
  });


  it("stops creating zones when more are pending than active above 50 zones", async () => {
    for (let i = 0; i < 30; i++) cf.addZone(`pending${i}.com`, "pending");
    for (let i = 0; i < 25; i++) cf.addZone(`active${i}.com`, "active");
    const results = await provision("all", true);
    expect(cf.writes).toEqual([]);
    expect(results[0]!.steps[0]).toMatchObject({ status: "blocked", detail: expect.stringMatching(/55 zones with 30 pending and 25 active/) });
    expect(results.slice(1).every((result) => result.steps[0]!.detail.startsWith("not attempted"))).toBe(true);
  });

  it("waits for the 25-per-10-minutes budget between zone creations", async () => {
    editConfig(fixture.root, "cloudflare.json", (config) => {
      (config.zones as { createPerWindow: number }).createPerWindow = 2;
    });
    let clock = 1_000_000;
    const sleeps: number[] = [];
    await provision("all", true, {
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    expect(cf.zones.map((zone) => zone.name)).toEqual(["asphaltpavingblackfoot.com", "pocatelloasphaltpaving.com", "asphaltpavingstgeorge.com"]);
    expect(sleeps).toEqual([600_000]);
  });

  it("stops with a clear message when Cloudflare refuses a new zone", async () => {
    cf.refuseZoneCreate = "Zone creation rate limit exceeded";
    const results = await provision("all", true);
    expect(results[0]!.steps).toEqual([expect.objectContaining({ status: "blocked", detail: expect.stringMatching(/refused a new zone .*25 per 10 minutes/) })]);
    expect(results[2]!.steps[0]!.detail).toMatch(/^not attempted/);
  });

  it("pauses and retries when the API rate-limits the token", async () => {
    cf.addLiveSite("asphaltpavingblackfoot.com", "asphalt-paving-blackfoot");
    cf.rateLimitNext = 1;
    const pauses: number[] = [];
    const api = throttled(cf, { minIntervalMs: 0, rateLimitPauseMs: 300_000, sleep: async (ms) => { pauses.push(ms); } });
    const [result] = await runDomainsProvision(fixture.root, "blackfoot", { api, accountId: cf.accountId, logger: memoryLogger() });
    expect(pauses).toEqual([300_000]);
    expect(result!.steps.some((step) => step.status === "error")).toBe(false);
  });
});
