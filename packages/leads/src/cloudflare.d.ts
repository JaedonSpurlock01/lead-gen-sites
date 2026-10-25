/** Minimal typing for the Workers module import; the full workers-types are not needed here. */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
