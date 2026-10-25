import { env as workerEnv } from "cloudflare:workers";
import type { APIRoute } from "astro";
import niche from "virtual:niche";
import site from "virtual:site";
import { resolveTracerEnv } from "./env";
import { handleLead } from "./handler";

export const prerender = false;

type RuntimeLocals = { runtime?: { env?: Record<string, unknown> } };

export const POST: APIRoute = ({ request, locals }) =>
  handleLead(request, {
    hostname: site.hostname,
    serviceOptions: site.serviceOptions,
    form: niche.form,
    env: () => resolveTracerEnv({ ...(workerEnv as Record<string, unknown>), ...((locals as RuntimeLocals).runtime?.env ?? {}) }),
  });

export const GET: APIRoute = () => new Response("Method not allowed", { status: 405 });
