import { z } from "zod";
import { identifier } from "./primitives";

/**
 * The lead form a niche collects. `packages/leads` validates every POST against it and sends the
 * fields to Tracer in this order, under each field's `label`.
 */
export const formFieldSchema = z
  .strictObject({
    /** The form input name. */
    name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/),
    /** The key Tracer receives. */
    label: z.string().min(1),
    kind: z.enum(["text", "textarea", "email", "phone", "number", "service"]),
    maxLength: z.number().int().positive(),
    /** `truncate` keeps the first maxLength characters; `reject` fails validation. */
    overflow: z.enum(["truncate", "reject"]).default("truncate"),
    minLength: z.number().int().min(0).default(1),
    lowercase: z.boolean().default(false),
    /** phone */
    minDigits: z.number().int().positive().optional(),
    maxDigits: z.number().int().positive().optional(),
    /** number: exclusive bounds */
    greaterThan: z.number().optional(),
    lessThan: z.number().optional(),
    /** number: how Tracer sees it, e.g. "{n} sq ft" with n formatted en-US. */
    format: z.string().includes("{n}").optional(),
  })
  .refine((field) => field.kind !== "phone" || field.minDigits !== undefined, "phone fields need minDigits");

export const formSchema = z.strictObject({
  fields: z.array(formFieldSchema).min(1),
  /** Where a successful (or honeypot) submission lands, e.g. "/thank-you" or "/thank-you/". */
  thankYouPath: z.string().startsWith("/").default("/thank-you"),
  honeypot: identifier.or(z.string().regex(/^[a-z_]+$/)).default("company_website"),
});

export type FormField = z.output<typeof formFieldSchema>;
export type FormConfig = z.output<typeof formSchema>;
