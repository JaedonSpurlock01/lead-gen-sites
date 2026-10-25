import type { TracerEnv } from "./env";

export type LeadHandlerOptions = {
  /** The canonical hostname Tracer matches the site by. */
  hostname: string;
  /** Allowed values of the `service` field (site.json serviceOptions). */
  serviceOptions: readonly string[];
  /** Resolves Tracer's URL and key from the Worker bindings. */
  env: () => Promise<TracerEnv>;
  fetch?: typeof fetch;
};

function clean(value: ReturnType<FormData["get"]>, max: number) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { Location: location } });
}

/**
 * Ported from the asphalt repo's src/pages/api/lead.ts. Validation, honeypot and every redirect
 * target are unchanged; only where the key comes from differs (see env.ts).
 */
export async function handleLead(request: Request, options: LeadHandlerOptions): Promise<Response> {
  const form = await request.formData();

  if (clean(form.get("company_website"), 200)) {
    return redirect("/thank-you", 303);
  }

  const name = clean(form.get("name"), 80);
  const phone = clean(form.get("phone"), 30);
  const email = clean(form.get("email"), 120);
  const size = clean(form.get("size"), 12);
  const service = clean(form.get("service"), 80);

  const sizeNumber = Number(size);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const serviceOk = options.serviceOptions.includes(service);
  const valid =
    name.length > 1 &&
    digits(phone).length >= 10 &&
    emailOk &&
    serviceOk &&
    Number.isFinite(sizeNumber) &&
    sizeNumber > 0 &&
    sizeNumber < 10000000;

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
    fields: {
      Name: name,
      Phone: phone,
      Email: email,
      Service: service,
      "Approx. size": `${sizeNumber.toLocaleString("en-US")} sq ft`,
    },
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

  return redirect("/thank-you", 303);
}
