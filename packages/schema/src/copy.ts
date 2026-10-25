import { z } from "zod";

/**
 * Shared copy a niche provides for every site (`niches/<niche>/copy/*.yaml`). Strings may use
 * `{{tokens}}` resolved per site; see tokens.ts. Each block is optional so a niche uses only what
 * its templates render.
 */
export const copySchema = z.strictObject({
  values: z.array(z.strictObject({ title: z.string().min(1), text: z.string().min(1) })).optional(),
  reasons: z
    .array(z.strictObject({ title: z.string().min(1), text: z.string().min(1), icon: z.string().min(1) }))
    .optional(),
  steps: z.array(z.strictObject({ title: z.string().min(1), text: z.string().min(1) })).optional(),
  faqs: z.array(z.strictObject({ question: z.string().min(1), answer: z.string().min(1) })).optional(),
});

export type Copy = z.output<typeof copySchema>;
export type FaqItem = NonNullable<Copy["faqs"]>[number];
