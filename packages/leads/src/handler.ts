import type { FormConfig, FormField } from "@lead-gen/schema";
import type { TracerEnv } from "./env";

export type LeadHandlerOptions = {
  /** The canonical hostname Tracer matches the site by. */
  hostname: string;
  /** Allowed values of `service` fields (site.json serviceOptions). */
  serviceOptions: readonly string[];
  /** The niche's form: which fields exist, how each is validated, and how Tracer labels it. */
  form: FormConfig;
  /** Resolves Tracer's URL and key from the Worker bindings. */
  env: () => Promise<TracerEnv>;
  fetch?: typeof fetch;
};

function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { Location: location } });
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Single-line fields lose control characters (as the asphalt sites always did); textareas keep line breaks. */
function read(form: FormData, field: FormField): { value: string; tooLong: boolean } {
  let raw = String(form.get(field.name) ?? "");
  raw = field.kind === "textarea" ? raw.trim() : raw.replace(/[\r\n\t]+/g, " ").trim();
  if (field.lowercase) raw = raw.toLowerCase();
  const tooLong = raw.length > field.maxLength;
  return { value: field.overflow === "truncate" ? raw.slice(0, field.maxLength) : raw, tooLong: field.overflow === "reject" && tooLong };
}

function check(field: FormField, value: string, serviceOptions: readonly string[]): boolean {
  if (value.length < field.minLength) return false;
  switch (field.kind) {
    case "email":
      return emailPattern.test(value);
    case "phone": {
      const count = digits(value).length;
      return count >= (field.minDigits ?? 0) && count <= (field.maxDigits ?? Infinity);
    }
    case "service":
      return serviceOptions.includes(value);
    case "number": {
      const number = Number(value);
      return (
        Number.isFinite(number) &&
        (field.greaterThan === undefined || number > field.greaterThan) &&
        (field.lessThan === undefined || number < field.lessThan)
      );
    }
    default:
      return true;
  }
}

function present(field: FormField, value: string): string {
  if (field.kind === "number" && field.format) return field.format.replace("{n}", Number(value).toLocaleString("en-US"));
  return value;
}

/**
 * The one lead handler. Honeypot, field validation and every redirect follow the asphalt
 * original; which fields exist and how strict each one is comes from niche.json `form`.
 */
export async function handleLead(request: Request, options: LeadHandlerOptions): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect("/contact/?error=1#error-fields", 303);
  }

  if (String(form.get(options.form.honeypot) ?? "").trim()) {
    return redirect(options.form.thankYouPath, 303);
  }

  const fields: Record<string, string> = {};
  let valid = true;
  for (const field of options.form.fields) {
    const { value, tooLong } = read(form, field);
    if (tooLong || !check(field, value, options.serviceOptions)) valid = false;
    fields[field.label] = present(field, value);
  }

  if (!valid) {
    return redirect("/contact/?error=1#error-fields", 303);
  }

  // Tracer stores the submission under this Site's Workspace, forwards it to the business
  // from this Site's address, and counts it as a lead. Every Site shares one Forms key and
  // names itself by hostname.
  const env = await options.env();
  if (!env.ok) {
    return redirect(`/contact/?error=${env.error}#error-${env.error}`, 303);
  }

  const submission = {
    site: options.hostname,
    submissionId: crypto.randomUUID(),
    page: new URL(request.headers.get("referer") ?? "/contact/", request.url).pathname,
    fields,
  };

  const doFetch = options.fetch ?? fetch;
  try {
    const response = await doFetch(env.formsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.formKey}` },
      body: JSON.stringify(submission),
    });
    if (!response.ok) {
      console.error("Tracer refused the lead:", response.status, await response.text().catch(() => ""));
      return redirect("/contact/?error=send#error-send", 303);
    }
  } catch (error) {
    console.error("Tracer lead post failed:", error);
    return redirect("/contact/?error=send#error-send", 303);
  }

  return redirect(options.form.thankYouPath, 303);
}
