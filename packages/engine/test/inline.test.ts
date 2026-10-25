import { describe, expect, it } from "vitest";
import { renderInline } from "../src/inline";

describe("renderInline", () => {
  it("escapes text and renders [text](href) links", () => {
    expect(renderInline("Call [(863) 695-2087](tel:+18636952087) or read <b>this</b> & [the guide](/dumpster-sizes/).")).toBe(
      'Call <a href="tel:+18636952087">(863) 695-2087</a> or read &lt;b&gt;this&lt;/b&gt; &amp; <a href="/dumpster-sizes/">the guide</a>.',
    );
  });

  it("leaves unsafe link targets as text", () => {
    expect(renderInline("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  });

  it("renders outbound links by id and drops unknown ids", () => {
    const outboundLinks = [{ id: "carson", href: "https://carsoncitysolarinstallation.com/", text: "Solar Panel Installation" }];
    expect(renderInline("See {{outbound:carson}} and {{outbound:nope}}.", { outboundLinks, outboundClass: "outbound-link" })).toBe(
      'See <a class="outbound-link" href="https://carsoncitysolarinstallation.com/" target="_blank" rel="noopener noreferrer">Solar Panel Installation</a> and .',
    );
  });
});
