import { describe, expect, it } from "vitest";
import { ContentError, parseServicePage, serializeServicePage, type ServicePage } from "../src/content";

const identity = { slug: "asphalt-repair", nav: "Asphalt Repair", formValue: "Asphalt Repair" };

const page: ServicePage = {
  ...identity,
  title: "Pothole Repair & Asphalt Patching in Blackfoot",
  description: "Pothole repair, asphalt patching, and crack sealing in Blackfoot — before winter.",
  h1: "Pothole Repair and Asphalt Patching in Blackfoot, Idaho",
  sections: [
    {
      heading: "Repair the damage before it spreads",
      paragraphs: ["Asphalt repair fixes the places pavement has already failed: potholes and cracks.", "Not every crack is a repair."],
    },
    {
      heading: "Where repairs pay off",
      paragraphs: ["Timely patches keep water out of the base."],
      bullets: ["Saw-cut patches with compacted base", "An honest recommendation"],
    },
  ],
};

describe("service page content", () => {
  it("round-trips through Markdown", () => {
    const markdown = serializeServicePage(page);
    expect(markdown).toContain("## Where repairs pay off");
    expect(markdown).toContain("- Saw-cut patches with compacted base");
    expect(markdown).not.toContain("nav:");
    expect(parseServicePage(markdown, identity)).toEqual(page);
  });

  it("joins soft-wrapped paragraph lines with a space and keeps text plain", () => {
    const markdown = `---\ntitle: T\ndescription: D\nh1: H\n---\n\n## Heading\n\nLine one\nline two with *stars* and <b>tags</b>.\n`;
    const parsed = parseServicePage(markdown, identity);
    expect(parsed.sections[0]?.paragraphs).toEqual(["Line one line two with *stars* and <b>tags</b>."]);
  });

  it("rejects text before the first heading, missing frontmatter and unknown frontmatter keys", () => {
    const base = "---\ntitle: T\ndescription: D\nh1: H\n---\n";
    expect(() => parseServicePage(`${base}\nstray paragraph\n\n## Heading\n\nBody\n`, identity)).toThrow(ContentError);
    expect(() => parseServicePage("## Heading\n\nBody\n", identity)).toThrow(ContentError);
    expect(() => parseServicePage(`---\ntitle: T\nextra: 1\n---\n\n## H\n\nBody\n`, identity)).toThrow();
    expect(() => parseServicePage(`${base}\n## Heading\n`, identity)).toThrow();
  });

  it("validates the slug it is given", () => {
    const markdown = serializeServicePage(page);
    expect(() => parseServicePage(markdown, { ...identity, slug: "Bad Slug" })).toThrow();
  });
});
