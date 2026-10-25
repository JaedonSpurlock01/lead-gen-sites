import type { ApiResponse, CloudflareApi, RequestOptions } from "../src/domains/api";

type Zone = { id: string; name: string; status: string; name_servers: string[]; account: { id: string } };
type DnsRecord = { id: string; type: string; name: string; content: string; proxied: boolean; ttl?: number; comment?: string };
type Rule = Record<string, unknown> & { id: string; ref?: string };
type Ruleset = { id: string; phase: string; kind: string; name: string; rules: Rule[] };
type CertPack = { id: string; status: string; hosts: string[] };
type WorkerDomain = { hostname: string; service: string; zone_id: string };

export type RecordedRequest = { method: string; path: string; query?: RequestOptions["query"]; body?: unknown };

/**
 * An in-memory Cloudflare account implementing the endpoints the domains commands use, with the
 * response envelope and status codes of the real API. Every request is recorded.
 */
export class MockCloudflare implements CloudflareApi {
  readonly requests: RecordedRequest[] = [];
  zones: Zone[] = [];
  settings = new Map<string, Record<string, unknown>>();
  dns = new Map<string, DnsRecord[]>();
  rulesets = new Map<string, Ruleset>();
  certs = new Map<string, CertPack[]>();
  workerDomains: WorkerDomain[] = [];
  workerRoutes = new Map<string, { id: string; pattern: string; script?: string }[]>();
  /** Respond 429 to the next N requests. */
  rateLimitNext = 0;
  /** Simulate Cloudflare refusing zone creation. */
  refuseZoneCreate: string | null = null;
  private seq = 0;

  constructor(readonly accountId = "acct123") {}

  get writes() {
    return this.requests.filter((request) => request.method !== "GET");
  }

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}${String(this.seq).padStart(4, "0")}`;
  }

  addZone(name: string, status = "active"): Zone {
    const zone: Zone = { id: this.id("zone"), name, status, name_servers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"], account: { id: this.accountId } };
    this.zones.push(zone);
    this.settings.set(zone.id, { ssl: "full", always_use_https: "off", min_tls_version: "1.0", tls_1_3: "on", automatic_https_rewrites: "on" });
    this.dns.set(zone.id, []);
    this.certs.set(zone.id, []);
    return zone;
  }

  /** A zone that already looks like a finished, live site. */
  addLiveSite(domain: string, worker: string): Zone {
    const zone = this.addZone(domain, "active");
    this.settings.set(zone.id, { ssl: "strict", always_use_https: "on", min_tls_version: "1.2", tls_1_3: "on", automatic_https_rewrites: "on" });
    this.dns.get(zone.id)!.push({ id: this.id("rec"), type: "AAAA", name: `www.${domain}`, content: "100::", proxied: true });
    this.certs.get(zone.id)!.push({ id: this.id("cert"), status: "active", hosts: [domain, `*.${domain}`] });
    this.workerDomains.push({ hostname: domain, service: worker, zone_id: zone.id });
    return zone;
  }

  private ok<T>(result: T, status = 200, info?: ApiResponse["result_info"]): ApiResponse<T> {
    return { status, success: true, result, errors: [], result_info: info };
  }
  private fail(status: number, code: number, message: string): ApiResponse<never> {
    return { status, success: false, result: null as never, errors: [{ code, message }] };
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    this.requests.push({ method, path, query: options.query, body: options.body });
    if (this.rateLimitNext > 0) {
      this.rateLimitNext -= 1;
      return this.fail(429, 10000, "Rate limited. Please wait and consider throttling your request speed") as ApiResponse<T>;
    }
    return this.route(method, path, options) as ApiResponse<T>;
  }

  private route(method: string, path: string, { query = {}, body }: RequestOptions): ApiResponse<unknown> {
    let match: RegExpMatchArray | null;
    const zoneById = (id: string) => this.zones.find((zone) => zone.id === id);

    if (path === "/zones" && method === "GET") {
      let zones = this.zones.filter((zone) => !query["account.id"] || zone.account.id === query["account.id"]);
      if (query.name) zones = zones.filter((zone) => zone.name === query.name);
      if (query.status) zones = zones.filter((zone) => zone.status === query.status);
      const perPage = Number(query.per_page ?? 20);
      return this.ok(zones.slice(0, perPage), 200, { page: 1, per_page: perPage, count: Math.min(perPage, zones.length), total_count: zones.length });
    }
    if (path === "/zones" && method === "POST") {
      if (this.refuseZoneCreate) return this.fail(400, 1118, this.refuseZoneCreate);
      const { name } = body as { name: string };
      if (this.zones.some((zone) => zone.name === name)) return this.fail(400, 1061, `${name} already exists`);
      return this.ok(this.addZone(name, "pending"));
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/settings\/([a-z0-9_]+)$/))) {
      const settings = this.settings.get(match[1]!);
      if (!settings) return this.fail(404, 1001, "Invalid zone identifier");
      if (method === "GET") return this.ok({ id: match[2], value: settings[match[2]!] ?? "off", editable: true });
      if (method === "PATCH") {
        settings[match[2]!] = (body as { value: unknown }).value;
        return this.ok({ id: match[2], value: settings[match[2]!] });
      }
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/dns_records$/))) {
      const records = this.dns.get(match[1]!);
      if (!records) return this.fail(404, 1001, "Invalid zone identifier");
      if (method === "GET") {
        return this.ok(records.filter((record) => (!query["name.exact"] || record.name === query["name.exact"]) && (!query.type || record.type === query.type)));
      }
      if (method === "POST") {
        const record = { id: this.id("rec"), ...(body as Omit<DnsRecord, "id">) };
        records.push(record);
        return this.ok(record);
      }
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/dns_records\/([^/]+)$/)) && method === "PATCH") {
      const record = this.dns.get(match[1]!)?.find((item) => item.id === match![2]);
      if (!record) return this.fail(404, 81044, "Record does not exist");
      Object.assign(record, body);
      return this.ok(record);
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/rulesets\/phases\/([a-z_]+)\/entrypoint$/)) && method === "GET") {
      if (!zoneById(match[1]!)) return this.fail(404, 1001, "Invalid zone identifier");
      const ruleset = this.rulesets.get(`${match[1]}:${match[2]}`);
      return ruleset ? this.ok(ruleset) : this.fail(404, 10003, "could not find entrypoint ruleset in the http_request_dynamic_redirect phase");
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/rulesets$/)) && method === "POST") {
      const input = body as Omit<Ruleset, "id">;
      const key = `${match[1]}:${input.phase}`;
      if (this.rulesets.has(key)) return this.fail(400, 20217, "a ruleset with this phase already exists");
      const ruleset: Ruleset = { ...input, id: this.id("rs"), rules: input.rules.map((rule) => ({ ...rule, id: this.id("rule") })) };
      this.rulesets.set(key, ruleset);
      return this.ok(ruleset);
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/rulesets\/([^/]+)\/rules$/)) && method === "POST") {
      const ruleset = [...this.rulesets.values()].find((item) => item.id === match![2]);
      if (!ruleset) return this.fail(404, 10003, "ruleset not found");
      ruleset.rules.push({ ...(body as Rule), id: this.id("rule") });
      return this.ok(ruleset);
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/rulesets\/([^/]+)\/rules\/([^/]+)$/)) && method === "PATCH") {
      const ruleset = [...this.rulesets.values()].find((item) => item.id === match![2]);
      const rule = ruleset?.rules.find((item) => item.id === match![3]);
      if (!ruleset || !rule) return this.fail(404, 10003, "rule not found");
      Object.assign(rule, body);
      return this.ok(ruleset);
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/ssl\/certificate_packs$/)) && method === "GET") {
      const packs = this.certs.get(match[1]!);
      return packs ? this.ok(packs) : this.fail(404, 1001, "Invalid zone identifier");
    }
    if ((match = path.match(/^\/zones\/([^/]+)\/workers\/routes$/)) && method === "GET") {
      if (!zoneById(match[1]!)) return this.fail(404, 1001, "Invalid zone identifier");
      return this.ok(this.workerRoutes.get(match[1]!) ?? []);
    }
    if ((match = path.match(/^\/accounts\/([^/]+)\/workers\/domains$/)) && method === "GET") {
      return this.ok(this.workerDomains.filter((item) => !query.hostname || item.hostname === query.hostname));
    }
    return this.fail(404, 7003, `mock: no route for ${method} ${path}`);
  }
}
