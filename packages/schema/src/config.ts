import { z } from "zod";

const comment = z.string().optional();

/** config/environments.json: TRACER_FORMS_URL per environment, set once for every site. */
export const environmentsConfigSchema = z
  .strictObject({
    $comment: comment,
    default: z.string().min(1),
    environments: z.record(z.string().min(1), z.strictObject({ tracerFormsUrl: z.url() })),
  })
  .refine((config) => config.default in config.environments, "default must name one of the environments");

/** config/cloudflare.json: non-secret Cloudflare settings shared by every site Worker. */
export const cloudflareConfigSchema = z.strictObject({
  $comment: comment,
  compatibilityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use yyyy-mm-dd"),
  compatibilityFlags: z.array(z.string().min(1)).default([]),
  secretsStore: z.strictObject({
    $comment: comment,
    storeId: z.string().min(1),
    secretName: z.string().min(1),
    binding: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "bindings are UPPER_SNAKE_CASE"),
  }),
  workersBudget: z
    .strictObject({ limit: z.number().int().positive(), warnAt: z.number().int().positive() })
    .refine((budget) => budget.warnAt <= budget.limit, "warnAt must not exceed limit"),
  deploy: z.strictObject({ concurrency: z.number().int().min(1).max(50) }),
  seo: z.strictObject({ outboundSiblingLinksWarnAt: z.number().int().min(0) }),
  api: z.strictObject({
    $comment: comment,
    minIntervalMs: z.number().int().min(0),
    rateLimitPauseMs: z.number().int().min(0),
  }),
  zones: z.strictObject({
    $comment: comment,
    createPerWindow: z.number().int().positive(),
    windowMs: z.number().int().positive(),
    pendingRuleAbove: z.number().int().min(0),
  }),
  wwwRecord: z.strictObject({ type: z.enum(["A", "AAAA"]), content: z.string().min(1) }),
});

/** config/zone-settings.json: Cloudflare zone setting id -> value, applied by `domains provision`. */
export const zoneSettingsConfigSchema = z.strictObject({
  $comment: comment,
  settings: z.record(z.string().min(1), z.union([z.string(), z.number(), z.boolean()])),
});

export const dnsRecordTypes = ["TXT", "CNAME", "MX", "A", "AAAA"] as const;

/** config/email-dns.json: SPF/DKIM/DMARC records for Tracer's sending provider. `{{domain}}` tokens allowed. */
export const emailDnsConfigSchema = z.strictObject({
  $comment: comment,
  provider: z.string().min(1).nullable(),
  records: z.array(
    z.strictObject({
      type: z.enum(dnsRecordTypes),
      name: z.string().min(1),
      content: z.string().min(1),
      priority: z.number().int().min(0).optional(),
      ttl: z.number().int().min(1).optional(),
      proxied: z.boolean().optional(),
    }),
  ),
});

export type EnvironmentsConfig = z.output<typeof environmentsConfigSchema>;
export type CloudflareConfig = z.output<typeof cloudflareConfigSchema>;
export type ZoneSettingsConfig = z.output<typeof zoneSettingsConfigSchema>;
export type EmailDnsConfig = z.output<typeof emailDnsConfigSchema>;
