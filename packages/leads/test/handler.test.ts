import { beforeEach, describe, expect, it, vi } from "vitest";
import { formSchema, type FormConfig } from "@lead-gen/schema";
import { handleLead, type LeadHandlerOptions } from "../src/handler";

/** The asphalt-paving niche.json form: the original handler's exact rules. */
const asphaltForm: FormConfig = formSchema.parse({
  thankYouPath: "/thank-you",
  fields: [
    { name: "name", label: "Name", kind: "text", maxLength: 80, minLength: 2 },
    { name: "phone", label: "Phone", kind: "phone", maxLength: 30, minDigits: 10 },
    { name: "email", label: "Email", kind: "email", maxLength: 120 },
    { name: "service", label: "Service", kind: "service", maxLength: 80 },
    { name: "size", label: "Approx. size", kind: "number", maxLength: 12, greaterThan: 0, lessThan: 10000000, format: "{n} sq ft" },
  ],
});

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
    form: asphaltForm,
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

describe("handleLead with other niche forms", () => {
  const dumpsterForm = formSchema.parse({
    thankYouPath: "/thank-you/",
    fields: [
      { name: "name", label: "Name", kind: "text", maxLength: 100 },
      { name: "phone", label: "Phone", kind: "phone", maxLength: 30, minDigits: 10, maxDigits: 15 },
      { name: "email", label: "Email", kind: "email", maxLength: 254, lowercase: true },
      { name: "service", label: "Service", kind: "service", maxLength: 100 },
      { name: "details", label: "Project details", kind: "textarea", maxLength: 2000, minLength: 3 },
    ],
  });
  const dumpsterServices = ["Residential Dumpster Rental", "Construction Dumpster Rental"];
  const dumpsterLead = { name: "Pat", phone: "(863) 555-0100", email: "Pat@Example.com", service: "Residential Dumpster Rental", details: "Garage cleanout\nDriveway placement" };

  it("sends the niche's fields in order with their labels, keeps textarea line breaks, lowercases email", async () => {
    const opts = options({ form: dumpsterForm, serviceOptions: dumpsterServices });
    const response = await handleLead(post(dumpsterLead), opts);
    expect(response.headers.get("location")).toBe("/thank-you/");
    const body = JSON.parse(((opts.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(Object.keys(body.fields)).toEqual(["Name", "Phone", "Email", "Service", "Project details"]);
    expect(body.fields).toMatchObject({ Email: "pat@example.com", "Project details": "Garage cleanout\nDriveway placement" });
  });

  it.each([
    ["details too short", { details: "ok" }],
    ["too many phone digits", { phone: "1234567890123456" }],
    ["unknown service", { service: "Asphalt Repair" }],
  ])("rejects %s", async (_label, bad) => {
    const opts = options({ form: dumpsterForm, serviceOptions: dumpsterServices });
    expect((await handleLead(post({ ...dumpsterLead, ...bad }), opts)).headers.get("location")).toBe("/contact/?error=1#error-fields");
  });

  it("rejects instead of truncating when a field says overflow: reject", async () => {
    const solarForm = formSchema.parse({
      thankYouPath: "/thank-you/",
      fields: [
        { name: "name", label: "Name", kind: "text", maxLength: 5, overflow: "reject" },
        { name: "service", label: "Service", kind: "service", maxLength: 100 },
      ],
    });
    const opts = options({ form: solarForm, serviceOptions: ["Solar Panel Repair"] });
    expect((await handleLead(post({ name: "Patricia", service: "Solar Panel Repair" }), opts)).headers.get("location")).toBe("/contact/?error=1#error-fields");
    expect((await handleLead(post({ name: "Pat", service: "Solar Panel Repair" }), opts)).headers.get("location")).toBe("/thank-you/");
  });

  it("treats an unreadable body as a field error", async () => {
    const bad = new Request("https://x.test/api/lead", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: "garbage" });
    expect((await handleLead(bad, options())).headers.get("location")).toBe("/contact/?error=1#error-fields");
  });
});
