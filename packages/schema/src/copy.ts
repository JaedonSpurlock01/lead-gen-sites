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
  /** Named snippets a niche's templates use, e.g. a call-to-action label. Sites may override them in copy.yaml. */
  strings: z.record(z.string(), z.string().min(1)).optional(),
  /** Footer paragraph listing what the business does. */
  footerBlurb: z.string().min(1).optional(),
  /** Lead form labels; each falls back to the shared default in LeadForm.astro. */
  form: z
    .strictObject({
      sizeLabel: z.string().min(1).optional(),
      serviceLabel: z.string().min(1).optional(),
      submitLabel: z.string().min(1).optional(),
      note: z.string().min(1).optional(),
    })
    .optional(),
});

export type Copy = z.output<typeof copySchema>;
export type FaqItem = NonNullable<Copy["faqs"]>[number];
