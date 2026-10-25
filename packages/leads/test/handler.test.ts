import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleLead, type LeadHandlerOptions } from "../src/handler";

const serviceOptions = ["Asphalt Driveway Paving", "Asphalt Repair", "Other"];

function post(fields: Record<string, string>, referer?: string) {
  const body = new URLSearchParams(fields);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (referer) headers.referer = referer;
  return new Request("https://asphaltpavingblackfoot.com/api/lead", { method: "POST", headers, body });
}

const good = { name: "Pat Doe", phone: "(208) 555-0100", email: "pat@example.com", size: "1200", service: "Asphalt Repair" };

function options(overrides: Partial<LeadHandlerOptions> = {}): LeadHandlerOptions {
  return {
    hostname: "asphaltpavingblackfoot.com",
    serviceOptions,
    env: async () => ({ ok: true, formsUrl: "https://tracer.test/api/forms", formKey: "secret-key" }),
    fetch: vi.fn(async () => new Response("ok", { status: 200 })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handleLead", () => {
  it("silently accepts honeypot submissions without calling Tracer", async () => {
    const opts = options();
    const response = await handleLead(post({ ...good, company_website: "spam.example" }), opts);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/thank-you");
    expect(opts.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["short name", { name: "P" }],
    ["short phone", { phone: "555-0100" }],
    ["bad email", { email: "pat@" }],
    ["unknown service", { service: "Roofing" }],
    ["zero size", { size: "0" }],
    ["huge size", { size: "10000000" }],
    ["non-numeric size", { size: "big" }],
  ])("redirects to the field error for %s", async (_label, bad) => {
    const opts = options();
    const response = await handleLead(post({ ...good, ...bad }), opts);
    expect(response.headers.get("location")).toBe("/contact/?error=1#error-fields");
    expect(opts.fetch).not.toHaveBeenCalled();
  });

  it("redirects to the config and bind errors from the environment", async () => {
    const config = await handleLead(post(good), options({ env: async () => ({ ok: false, error: "config" }) }));
    expect(config.headers.get("location")).toBe("/contact/?error=config#error-config");
    const bind = await handleLead(post(good), options({ env: async () => ({ ok: false, error: "bind" }) }));
    expect(bind.headers.get("location")).toBe("/contact/?error=bind#error-bind");
  });

  it("posts the Tracer contract with the bearer key and redirects to thank-you", async () => {
    const opts = options();
    const response = await handleLead(post(good, "https://asphaltpavingblackfoot.com/contact/"), opts);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/thank-you");

    const fetchMock = opts.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tracer.test/api/forms");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer secret-key" });
    const body = JSON.parse(init.body as string);
    expect(body.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toEqual({
      site: "asphaltpavingblackfoot.com",
      submissionId: body.submissionId,
      page: "/contact/",
      fields: {
        Name: "Pat Doe",
        Phone: "(208) 555-0100",
        Email: "pat@example.com",
        Service: "Asphalt Repair",
        "Approx. size": "1,200 sq ft",
      },
    });
  });

  it("falls back to /contact/ as the page when there is no referer and strips control characters", async () => {
    const opts = options();
    await handleLead(post({ ...good, name: "Pat\r\n\tDoe" }), opts);
    const body = JSON.parse(((opts.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.page).toBe("/contact/");
    expect(body.fields.Name).toBe("Pat Doe");
  });

  it("treats any non-2xx from Tracer and any network failure as a send error", async () => {
    const refused = await handleLead(post(good), options({ fetch: async () => new Response("nope", { status: 401 }) }));
    expect(refused.headers.get("location")).toBe("/contact/?error=send#error-send");
    const down = await handleLead(post(good), options({ fetch: async () => { throw new Error("ECONNRESET"); } }));
    expect(down.headers.get("location")).toBe("/contact/?error=send#error-send");
  });
});
