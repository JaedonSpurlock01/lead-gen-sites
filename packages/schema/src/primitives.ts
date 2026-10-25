import { z } from "zod";

/** Folder-safe id: lowercase letters, digits, single hyphens. Used for site ids, niche ids and service slugs. */
export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "use lowercase letters, numbers, and single hyphens");

/**
 * Cloudflare Worker name. Alphanumeric and dashes only; 63 chars max so the name also
 * works as a workers.dev DNS label (workers.dev is off for sites, but keep the safe bound).
 */
export const workerName = z
  .string()
  .max(63, "Worker names are limited to 63 characters")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Worker names use lowercase letters, numbers, and dashes, and cannot start or end with a dash");

/** JS-identifier-ish key, used for image slots, market fields and theme tokens. */
export const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/, "use a camelCase identifier");

export const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "use a #hex color");

/** E.164 phone number, e.g. +12087827152. */
export const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "use E.164 format, e.g. +12087827152");

/** Decimal coordinate kept as a string so JSON-LD output stays byte-identical to the source sites. */
export const coordinate = z.string().regex(/^-?\d{1,3}(?:\.\d+)?$/, "use a decimal coordinate string");

/** A relative file path inside the niche (sites may reach shared niche assets with ../../assets/...). */
export const relativePath = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(value), "use a path relative to the site folder")
  .refine((value) => !value.includes("\\"), "use forward slashes");
