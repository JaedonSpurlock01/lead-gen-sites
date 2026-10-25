import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cloudflareConfigSchema, environmentsConfigSchema, zoneSettingsConfigSchema } from "../src/config";

const configDir = join(import.meta.dirname, "../../../config");
const read = (name: string) => JSON.parse(readFileSync(join(configDir, name), "utf8"));

describe("config files", () => {
  it("environments.json parses and names a valid default", () => {
    const config = environmentsConfigSchema.parse(read("environments.json"));
    expect(config.environments[config.default]?.tracerFormsUrl).toMatch(/^https:\/\//);
  });

  it("cloudflare.json parses", () => {
    const config = cloudflareConfigSchema.parse(read("cloudflare.json"));
    expect(config.workersBudget.warnAt).toBeLessThanOrEqual(config.workersBudget.limit);
    expect(config.secretsStore.binding).toBe("TRACER_FORM_KEY");
  });

  it("zone-settings.json parses", () => {
    expect(zoneSettingsConfigSchema.parse(read("zone-settings.json")).settings.ssl).toBe("strict");
  });

  it("rejects a default that names no environment", () => {
    expect(
      environmentsConfigSchema.safeParse({ default: "prod", environments: { staging: { tracerFormsUrl: "https://x.test/f" } } })
        .success,
    ).toBe(false);
  });
});
