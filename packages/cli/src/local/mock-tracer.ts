import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";

/** The Tracer forms contract, as sites must send it. */
export const tracerSubmissionSchema = z.strictObject({
  site: z.string().regex(/^[a-z0-9.-]+$/),
  submissionId: z.uuid(),
  page: z.string().startsWith("/"),
  fields: z.strictObject({
    Name: z.string().min(2),
    Phone: z.string().min(10),
    Email: z.email(),
    Service: z.string().min(1),
    "Approx. size": z.string().regex(/^[\d,]+ sq ft$/),
  }),
});

export type TracerSubmission = z.output<typeof tracerSubmissionSchema>;

export type ReceivedLead = {
  path: string;
  authorized: boolean;
  contentType: string;
  valid: boolean;
  problems: string[];
  body: unknown;
};

export type MockTracer = {
  url: string;
  received: ReceivedLead[];
  /** Status the next requests get when they are otherwise valid; set to 500 to test the send-error path. */
  respondWith: number;
  close(): Promise<void>;
};

/**
 * A local stand-in for Tracer's POST /api/forms, answering like the real handler
 * (tracer: data/forms-handler.ts): 201 for a new submission, 200 for a repeated submission id,
 * 401 for a wrong key, 404 for a hostname that is not a known Site, 400 for a bad body.
 * `sites` lists the known hostnames; when omitted every hostname is accepted.
 */
export async function startMockTracer(formKey: string, port = 0, sites?: string[]): Promise<MockTracer> {
  const received: ReceivedLead[] = [];
  const seen = new Set<string>();
  const state = { respondWith: 200 };
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      const authorized = req.headers.authorization === `Bearer ${formKey}`;
      const contentType = req.headers["content-type"] ?? "";
      const problems: string[] = [];
      let body: unknown = raw;
      if (req.method !== "POST") problems.push(`method ${req.method}`);
      if (req.url !== "/api/forms") problems.push(`path ${req.url}`);
      if (!contentType.startsWith("application/json")) problems.push(`content-type ${contentType}`);
      try {
        body = JSON.parse(raw);
        const parsed = tracerSubmissionSchema.safeParse(body);
        if (!parsed.success) problems.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
      } catch {
        problems.push("body is not JSON");
      }
      if (!authorized) problems.push("bearer key mismatch");
      received.push({ path: req.url ?? "", authorized, contentType, valid: problems.length === 0, problems, body });
      const submission = body as Partial<TracerSubmission>;
      const known = !sites || (typeof submission?.site === "string" && sites.includes(submission.site));
      if (authorized && problems.length === 0 && !known) problems.push(`unknown site ${submission.site}`);
      const key = `${submission?.site}:${submission?.submissionId}`;
      const repeat = seen.has(key);
      const status = !authorized ? 401 : !known ? 404 : problems.length > 0 ? 400 : state.respondWith !== 200 ? state.respondWith : repeat ? 200 : 201;
      if (status === 201) seen.add(key);
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ ok: status < 300 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const { port: bound } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${bound}/api/forms`,
    received,
    get respondWith() {
      return state.respondWith;
    },
    set respondWith(value: number) {
      state.respondWith = value;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
