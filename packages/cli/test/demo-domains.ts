/**
 * Prints `domains provision` (dry-run) and `domains check` for every site against the in-memory
 * Cloudflare simulator. No network calls except the HTTP checks, which are faked too.
 * Run: pnpm tsx packages/cli/test/demo-domains.ts
 */
import { findRepoRoot } from "@lead-gen/engine/load";
import { runDomainsCheck } from "../src/domains/check";
import { runDomainsProvision } from "../src/domains/provision";
import { consoleLogger } from "../src/log";
import { MockCloudflare } from "./cloudflare-mock";

const root = findRepoRoot(process.cwd());
const cf = new MockCloudflare("your-account-id");
// Modeled on what the live sites show over HTTP today: apex and www both answer 200 from the Worker
// and plain http is not redirected. Assumed (no API token here): www is a second custom domain on
// each Worker, zone settings are Cloudflare defaults, and there is no redirect rule.
for (const [domain, worker] of [
  ["asphaltpavingblackfoot.com", "asphalt-paving-blackfoot"],
  ["pocatelloasphaltpaving.com", "asphalt-paving-pocatello"],
  ["asphaltpavingstgeorge.com", "asphalt-paving-st-george"],
] as const) {
  const zone = cf.addZone(domain, "active");
  cf.certs.get(zone.id)!.push({ id: `cert-${zone.id}`, status: "active", hosts: [domain, `*.${domain}`] });
  cf.workerDomains.push({ hostname: domain, service: worker, zone_id: zone.id });
  cf.workerDomains.push({ hostname: `www.${domain}`, service: worker, zone_id: zone.id });
}

console.log("=================== pnpm domains provision all   (dry-run)\n");
await runDomainsProvision(root, "all", { api: cf, accountId: cf.accountId, logger: consoleLogger });
console.log(`\nrequests made: ${cf.requests.length} (${cf.writes.length} writes)`);

console.log("\n=================== pnpm domains check all\n");
const fakeHttp = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  return new Response("<html></html>", { status: 200 });
}) as typeof fetch;
await runDomainsCheck(root, "all", { api: cf, accountId: cf.accountId, fetch: fakeHttp, logger: consoleLogger });
