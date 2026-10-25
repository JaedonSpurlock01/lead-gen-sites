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
  it("accepts a contract-shaped lead with the right key", async () => {
    tracer = await startMockTracer("k");
    expect((await post(tracer.url, lead)).status).toBe(200);
    expect(tracer.received[0]).toMatchObject({ authorized: true, valid: true, problems: [] });
  });

  it("rejects a wrong key, a bad body, and can simulate a Tracer failure", async () => {
    tracer = await startMockTracer("k");
    expect((await post(tracer.url, lead, "wrong")).status).toBe(401);
    expect((await post(tracer.url, { ...lead, fields: { ...lead.fields, Extra: "x" } })).status).toBe(400);
    expect(tracer.received[1]?.problems.join()).toMatch(/Unrecognized key/);
    tracer.respondWith = 500;
    expect((await post(tracer.url, lead)).status).toBe(500);
  });
});
