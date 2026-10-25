import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { slug } from "./primitives";


export const serviceSectionSchema = z.strictObject({
  heading: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
  bullets: z.array(z.string().min(1)).min(1).optional(),
});

/** Frontmatter of `content/services/<slug>.md`. nav and formValue come from niche.json, not from here. */
export const serviceFrontmatterSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1),
  h1: z.string().min(1),
});

/** Identity of a service as niche.json declares it; the loader merges it with the page content. */
export const serviceIdentitySchema = z.object({
  slug,
  nav: z.string().min(1),
  formValue: z.string().min(1),
});

/** One service page: the same shape the asphalt repo's services.ts used, now parsed from Markdown. */
export const servicePageSchema = serviceFrontmatterSchema.extend(serviceIdentitySchema.shape).extend({
  sections: z.array(serviceSectionSchema).min(1),
});

export type ServiceSection = z.output<typeof serviceSectionSchema>;
export type ServiceFrontmatter = z.output<typeof serviceFrontmatterSchema>;
export type ServiceIdentity = z.output<typeof serviceIdentitySchema>;
export type ServicePage = z.output<typeof servicePageSchema>;

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentError";
  }
}

function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const normalized = source.replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new ContentError("missing frontmatter: the file must start with a --- block");
  return { frontmatter: match[1] ?? "", body: match[2] ?? "" };
}

/**
 * Parses a service page. The body is a sequence of `## Heading` sections; blank lines separate
 * blocks; a block of `- ` lines is the section's bullet list; every other block is a paragraph
 * (soft line breaks join with a space). Text is kept as plain text, exactly as the source sites
 * rendered it, so no inline Markdown is interpreted.
 */
export function parseServicePage(source: string, service: ServiceIdentity): ServicePage {
  const { frontmatter, body } = splitFrontmatter(source);
  const data: unknown = frontmatter.trim() ? parseYaml(frontmatter) : {};
  const sections: ServiceSection[] = [];
  let current: { heading: string; paragraphs: string[]; bullets: string[] } | null = null;

  const flushBlock = (block: string[]) => {
    if (block.length === 0) return;
    if (!current) throw new ContentError(`content before the first "## " heading: ${JSON.stringify(block[0])}`);
    if (block.every((line) => line.startsWith("- "))) {
      current.bullets.push(...block.map((line) => line.slice(2).trim()));
    } else {
      current.paragraphs.push(block.map((line) => line.trim()).join(" "));
    }
  };

  let block: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("## ")) {
      flushBlock(block);
      block = [];
      if (current) sections.push(toSection(current));
      current = { heading: line.slice(3).trim(), paragraphs: [], bullets: [] };
      continue;
    }
    if (line.trim() === "") {
      flushBlock(block);
      block = [];
      continue;
    }
    block.push(line);
  }
  flushBlock(block);
  if (current) sections.push(toSection(current));

  const { slug, nav, formValue } = serviceIdentitySchema.parse(service);
  return servicePageSchema.parse({ ...(data as object), slug, nav, formValue, sections });
}

function toSection(draft: { heading: string; paragraphs: string[]; bullets: string[] }): ServiceSection {
  return draft.bullets.length > 0
    ? { heading: draft.heading, paragraphs: draft.paragraphs, bullets: draft.bullets }
    : { heading: draft.heading, paragraphs: draft.paragraphs };
}

/** The inverse of parseServicePage; used by the port script and `new-site`. */
export function serializeServicePage(page: ServicePage): string {
  const { slug: _slug, nav: _nav, formValue: _formValue, sections, ...frontmatter } = page;
  const header = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const body = sections
    .map((section) => {
      const parts = [`## ${section.heading}`, ...section.paragraphs];
      if (section.bullets) parts.push(section.bullets.map((bullet) => `- ${bullet}`).join("\n"));
      return parts.join("\n\n");
    })
    .join("\n\n");
  return `---\n${header}\n---\n\n${body}\n`;
}
