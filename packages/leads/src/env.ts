/** A Secrets Store binding: `secrets_store_secrets` in wrangler.jsonc exposes an object with get(). */
export type SecretsStoreBinding = { get(): Promise<string> };

export type TracerEnv =
  | { ok: true; formsUrl: string; formKey: string }
  | { ok: false; error: "config" | "bind" };

function isBinding(value: unknown): value is SecretsStoreBinding {
  return typeof value === "object" && value !== null && typeof (value as SecretsStoreBinding).get === "function";
}

/**
 * Reads TRACER_FORMS_URL (a plain var) and TRACER_FORM_KEY from the Worker bindings.
 * The key is normally a Secrets Store binding; a plain string is accepted so the
 * `pnpm secrets rotate` fallback (a regular Worker secret) keeps working.
 *
 * - `config`: the URL or the key binding is missing entirely.
 * - `bind`: the Secrets Store binding exists but `get()` failed (secret missing from the store, wrong scope).
 */
export async function resolveTracerEnv(bindings: Record<string, unknown>): Promise<TracerEnv> {
  const rawUrl = bindings.TRACER_FORMS_URL;
  const formsUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";
  const rawKey = bindings.TRACER_FORM_KEY;
  let formKey = "";
  if (typeof rawKey === "string") {
    formKey = rawKey.trim();
  } else if (isBinding(rawKey)) {
    try {
      formKey = (await rawKey.get()).trim();
    } catch (error) {
      console.error("TRACER_FORM_KEY binding failed:", error);
      return { ok: false, error: "bind" };
    }
    if (!formKey) return { ok: false, error: "bind" };
  }
  if (!formsUrl || !formKey) return { ok: false, error: "config" };
  return { ok: true, formsUrl, formKey };
}
