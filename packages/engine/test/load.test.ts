import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSite } from "../src/load";

const realRoot = join(import.meta.dirname, "../../..");
let root: string;
let nicheDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lead-gen-load-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  nicheDir = join(root, "niches", "dumpster-rental");
  mkdirSync(nicheDir, { recursive: true });
  for (const name of ["niche.json", "sites"]) cpSync(join(realRoot, "niches", "dumpster-rental", name), join(nicheDir, name), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const pagePath = (name: string) => join(nicheDir, "sites", "haines-city", "content", `${name}.yaml`);
const edit = (name: string, change: (text: string) => string) => writeFileSync(pagePath(name), change(readFileSync(pagePath(name), "utf8")));

describe("loadSite with block pages", () => {
  it("loads every required page and every service page", () => {
    const loaded = loadSite(nicheDir, "haines-city");
    expect(Object.keys(loaded.pages).sort()).toEqual([
      "404",
      "about",
      "contact",
      "dumpster-sizes",
      "index",
      "services/commercial-dumpster-rental",
      "services/construction-dumpster-rental",
      "services/residential-dumpster-rental",
      "thank-you",
    ]);
    expect(loaded.services).toEqual([]);
    expect(loaded.pages.index!.blocks.map((block) => block.type)).toContain("faq");
    // {{url}} tokens in JSON-LD resolve to the site URL.
    expect(JSON.stringify(loaded.pages["services/commercial-dumpster-rental"]!.jsonLd)).toContain("https://dumpsterrentalshainescity.com/services/commercial-dumpster-rental/");
  });

  it("rejects a block type the niche does not render", () => {
    edit("pages/about", (text) => `${text.trimEnd()}\n  - type: links\n`);
    expect(() => loadSite(nicheDir, "haines-city")).toThrow(/block type\(s\) links are not in niche.json blocks/);
  });

  it("rejects an image that is not an image slot", () => {
    edit("pages/index", (text) => text.replace("image: delivery", "image: drone"));
    expect(() => loadSite(nicheDir, "haines-city")).toThrow(/image "drone" is not an image slot/);
  });

  it("requires every page niche.json lists", () => {
    rmSync(pagePath("pages/dumpster-sizes"));
    expect(() => loadSite(nicheDir, "haines-city")).toThrow(/dumpster-sizes.yaml is missing/);
  });

  it("rejects unknown fields in a block", () => {
    edit("pages/index", (text) => text.replace("  - type: trust\n", "  - type: trust\n    colour: red\n"));
    expect(() => loadSite(nicheDir, "haines-city")).toThrow(/Unrecognized key/);
  });
});
