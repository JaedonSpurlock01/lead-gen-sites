import { describe, expect, it, vi } from "vitest";
import { resolveTracerEnv } from "../src/env";

describe("resolveTracerEnv", () => {
  it("reads the key from a Secrets Store binding", async () => {
    const binding = { get: vi.fn(async () => " key-1 ") };
    await expect(resolveTracerEnv({ TRACER_FORMS_URL: "https://t.test/api/forms ", TRACER_FORM_KEY: binding })).resolves.toEqual({
      ok: true,
      formsUrl: "https://t.test/api/forms",
      formKey: "key-1",
    });
    expect(binding.get).toHaveBeenCalledTimes(1);
  });

  it("accepts a plain string key (the secrets rotate fallback)", async () => {
    await expect(resolveTracerEnv({ TRACER_FORMS_URL: "https://t.test/f", TRACER_FORM_KEY: "plain" })).resolves.toEqual({
      ok: true,
      formsUrl: "https://t.test/f",
      formKey: "plain",
    });
  });

  it("reports config when the URL or the key binding is missing", async () => {
    await expect(resolveTracerEnv({ TRACER_FORM_KEY: "k" })).resolves.toEqual({ ok: false, error: "config" });
    await expect(resolveTracerEnv({ TRACER_FORMS_URL: "https://t.test/f" })).resolves.toEqual({ ok: false, error: "config" });
    await expect(resolveTracerEnv({ TRACER_FORMS_URL: "https://t.test/f", TRACER_FORM_KEY: "  " })).resolves.toEqual({
      ok: false,
      error: "config",
    });
  });

  it("reports bind when the binding exists but get() fails or is empty", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { get: async () => { throw new Error("secret not found"); } };
    await expect(resolveTracerEnv({ TRACER_FORMS_URL: "https://t.test/f", TRACER_FORM_KEY: failing })).resolves.toEqual({
      ok: false,
      error: "bind",
    });
    await expect(resolveTracerEnv({ TRACER_FORMS_URL: "https://t.test/f", TRACER_FORM_KEY: { get: async () => "" } })).resolves.toEqual({
      ok: false,
      error: "bind",
    });
  });
});
