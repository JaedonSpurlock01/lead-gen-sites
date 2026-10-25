import { describe, expect, it } from "vitest";
import { domainProblem, isApexDomain, siteUrl } from "../src/domain";

describe("domainProblem", () => {
  it.each([
    ["example.com", null],
    ["asphaltpavingstgeorge.com", null],
    ["example.co.uk", null],
    ["", "empty"],
    ["www.example.com", "www"],
    ["Example.com", "uppercase"],
    ["example.com/", "scheme-or-path"],
    ["example.com:443", "scheme-or-path"],
    ["sub.example.com", "not-apex"],
    ["sub.example.co.uk", "not-apex"],
    ["localhost", "not-icann"],
    ["203.0.113.4", "invalid-hostname"],
    ["foo.github.io", "not-apex"],
  ])("%s -> %s", (value, problem) => {
    expect(domainProblem(value)).toBe(problem);
  });

  it("isApexDomain and siteUrl agree with domainProblem", () => {
    expect(isApexDomain("example.com")).toBe(true);
    expect(isApexDomain("www.example.com")).toBe(false);
    expect(siteUrl("example.com")).toBe("https://example.com");
  });
});
