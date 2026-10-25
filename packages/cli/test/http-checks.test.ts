import { describe, expect, it } from "vitest";
import { httpChecks } from "../src/domains/http-checks";

const ref = { niche: "asphalt-paving", id: "pocatello", nicheDir: "", siteDir: "" };

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const handler = routes[url];
    if (!handler) throw new Error(`no route for ${url}`);
    return handler();
  }) as typeof fetch;
}

describe("httpChecks", () => {
  it("passes when / is 200 and www redirects to the apex", async () => {
    const result = await httpChecks(ref, "pocatelloasphaltpaving.com", {
      fetch: fakeFetch({
        "https://pocatelloasphaltpaving.com/": () => new Response("ok", { status: 200 }),
        "https://www.pocatelloasphaltpaving.com/": () => new Response(null, { status: 301, headers: { location: "https://pocatelloasphaltpaving.com/" } }),
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual(["root", "www"]);
  });

  it("fails on a missing www redirect or an unreachable root, and only posts a lead when asked", async () => {
    const posted: string[] = [];
    const result = await httpChecks(ref, "pocatelloasphaltpaving.com", {
      withLead: true,
      fetch: fakeFetch({
        "https://www.pocatelloasphaltpaving.com/": () => new Response("ok", { status: 200 }),
        "https://pocatelloasphaltpaving.com/api/lead": () => {
          posted.push("lead");
          return new Response(null, { status: 303, headers: { location: "/thank-you" } });
        },
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks.map((check) => `${check.name}:${check.ok}`)).toEqual(["root:false", "www:false", "lead:true"]);
    expect(posted).toEqual(["lead"]);
  });
});
