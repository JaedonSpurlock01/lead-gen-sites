import { afterEach, describe, expect, it } from "vitest";
import { startMockTracer, type MockTracer } from "../src/local/mock-tracer";

let tracer: MockTracer | undefined;
afterEach(async () => {
  await tracer?.close();
});

const lead = {
  site: "asphaltpavingblackfoot.com",
  submissionId: "42c7eac1-205a-475e-8576-bf477548b860",
  page: "/contact/",
  fields: { Name: "Pat Doe", Phone: "2085550100", Email: "pat@example.com", Service: "Asphalt Repair", "Approx. size": "1,200 sq ft" },
};

const post = (url: string, body: unknown, key = "k") =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });

describe("mock Tracer", () => {
  it("answers 201 for a new lead, 200 for a repeat, and 404 for an unknown site, like Tracer", async () => {
    tracer = await startMockTracer("k", 0, ["asphaltpavingblackfoot.com"]);
    expect((await post(tracer.url, lead)).status).toBe(201);
    expect(tracer.received[0]).toMatchObject({ authorized: true, valid: true, problems: [] });
    expect((await post(tracer.url, lead)).status).toBe(200);
    expect((await post(tracer.url, { ...lead, site: "not-a-site.com" })).status).toBe(404);
  });

  it("rejects a wrong key, a bad body, and can simulate a Tracer failure", async () => {
    tracer = await startMockTracer("k");
    expect((await post(tracer.url, lead, "wrong")).status).toBe(401);
    expect((await post(tracer.url, { ...lead, fields: { Phone: "2085550100" } })).status).toBe(400);
    expect(tracer.received[1]?.problems.join()).toMatch(/Name is required/);
    tracer.respondWith = 500;
    expect((await post(tracer.url, lead)).status).toBe(500);
  });
});

describe("sampleLead", () => {
  it("builds a valid submission for any niche form and the fields Tracer should get", async () => {
    const { formSchema } = await import("@lead-gen/schema");
    const { sampleLead } = await import("../src/local/verify");
    const form = formSchema.parse({
      fields: [
        { name: "name", label: "Name", kind: "text", maxLength: 80 },
        { name: "size", label: "Approx. size", kind: "number", maxLength: 12, format: "{n} sq ft" },
        { name: "details", label: "Project details", kind: "textarea", maxLength: 2000 },
        { name: "service", label: "Service", kind: "service", maxLength: 80 },
      ],
    });
    const sample = sampleLead(form, ["Asphalt Repair"]);
    expect(sample.form).toEqual({ name: "Local Verify", size: "1200", details: "Local verify test lead: property details", service: "Asphalt Repair" });
    expect(sample.expected).toEqual({ Name: "Local Verify", "Approx. size": "1,200 sq ft", "Project details": "Local verify test lead: property details", Service: "Asphalt Repair" });
  });
});
