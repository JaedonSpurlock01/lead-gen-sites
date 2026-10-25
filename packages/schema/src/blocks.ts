import { z } from "zod";
import { identifier, slug } from "./primitives";

/**
 * Block-based page content (`content/pages/<name>.yaml`, `content/services/<slug>.yaml`).
 * Text is plain with two inline forms: `[text](href)` links and `{{outbound:<id>}}` links to
 * the site's outboundLinks. Each niche renders the block types it lists in niche.json `blocks`.
 */

const text = z.string().min(1);
const paragraphs = z.array(text).min(1);
/** An image slot name from niche.json imageSlots. */
const image = identifier;
const tone = z.enum(["default", "alt", "dark"]).default("default");
const link = z.strictObject({ text, href: text });

const card = z.strictObject({
  heading: text,
  text: text.optional(),
  paragraphs: paragraphs.optional(),
  icon: z.string().min(1).optional(),
});

const column = z.strictObject({
  eyebrow: text.optional(),
  heading: text.optional(),
  paragraphs,
  bullets: z.array(text).min(1).optional(),
  link: link.optional(),
});

const aside = z.strictObject({
  heading: text,
  paragraphs: z.array(text).optional(),
  /** Heading shown above the bullets. */
  bulletsHeading: text.optional(),
  bullets: z.array(text).min(1).optional(),
  after: z.array(text).optional(),
});

export const heroSchema = z.strictObject({
  /** Niche-defined hero style, e.g. "image", "split", "plain", "content". */
  variant: z.string().min(1).default("default"),
  eyebrow: text.optional(),
  h1: text,
  lede: text.optional(),
  image: image.optional(),
  imageAlt: text.optional(),
  breadcrumb: text.optional(),
  /** Buttons for plain heroes, e.g. on thank-you and 404 pages. */
  actions: z.array(link.extend({ style: z.enum(["primary", "secondary"]).default("primary") })).optional(),
});

export const blockSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("trust"), items: z.array(text).min(1) }),
  z.strictObject({
    type: z.literal("prose"),
    tone,
    eyebrow: text.optional(),
    heading: text.optional(),
    paragraphs: z.array(text).default([]),
    /** Larger intro styling for the paragraphs. */
    lede: z.boolean().default(false),
    bullets: z.array(text).min(1).optional(),
    bulletStyle: z.enum(["disc", "check"]).default("disc"),
    /** Paragraphs shown after the bullets. */
    closing: z.array(text).min(1).optional(),
    link: link.optional(),
    image: image.optional(),
    imageAlt: text.optional(),
    aside: aside.optional(),
    /** Cards shown under the prose in the same section. */
    cards: z.array(card).min(1).optional(),
    numbered: z.boolean().default(false),
  }),
  z.strictObject({
    type: z.literal("columns"),
    tone,
    eyebrow: text.optional(),
    heading: text.optional(),
    columns: z.array(column).min(2),
  }),
  z.strictObject({
    type: z.literal("cards"),
    tone,
    eyebrow: text.optional(),
    heading: text,
    intro: text.optional(),
    cards: z.array(card).min(1),
    numbered: z.boolean().default(false),
    /** Grid columns on wide screens; the niche picks a default when omitted. */
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  }),
  z.strictObject({
    type: z.literal("steps"),
    tone,
    eyebrow: text.optional(),
    heading: text,
    intro: text.optional(),
    image: image.optional(),
    imageAlt: text.optional(),
    steps: z.array(z.strictObject({ heading: text, text })).min(1),
  }),
  z.strictObject({
    type: z.literal("services"),
    tone,
    eyebrow: text.optional(),
    heading: text,
    intro: text.optional(),
    /** Per-service card text and image alt; text defaults to the service page's hero lede. */
    items: z.array(z.strictObject({ slug, text: text.optional(), imageAlt: text.optional() })).optional(),
  }),
  z.strictObject({
    type: z.literal("faq"),
    tone,
    eyebrow: text.optional(),
    heading: text,
    intro: text.optional(),
    items: z.array(z.strictObject({ question: text, answer: text })).min(1),
  }),
  z.strictObject({
    type: z.literal("article"),
    image: image.optional(),
    imageAlt: text.optional(),
    imagePosition: z.enum(["top", "side"]).default("top"),
    sections: z.array(z.strictObject({ heading: text, paragraphs, bullets: z.array(text).min(1).optional() })).min(1),
    closing: text.optional(),
  }),
  z.strictObject({
    type: z.literal("form"),
    tone,
    eyebrow: text.optional(),
    heading: text,
    intro: text.optional(),
    paragraphs: z.array(text).optional(),
    bullets: z.array(text).min(1).optional(),
    formHeading: text.optional(),
    aside: aside.optional(),
  }),
  z.strictObject({ type: z.literal("cta"), heading: text, text }),
  z.strictObject({ type: z.literal("links"), tone, heading: text.optional(), intro: text.optional() }),
]);

export const blockPageSchema = z.strictObject({
  title: text,
  description: text,
  noindex: z.boolean().default(false),
  hero: heroSchema.optional(),
  blocks: z.array(blockSchema).default([]),
  /** Extra JSON-LD objects for this page. `{{url}}`-style tokens are allowed. */
  jsonLd: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type Block = z.output<typeof blockSchema>;
export type BlockType = Block["type"];
export type BlockPage = z.output<typeof blockPageSchema>;
export type Hero = z.output<typeof heroSchema>;
export const blockTypes = blockSchema.options.map((option) => option.shape.type.value) as BlockType[];
