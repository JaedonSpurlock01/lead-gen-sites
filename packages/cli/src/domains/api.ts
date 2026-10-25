export type ApiError = { code: number; message: string };
export type ApiResponse<T = unknown> = {
  status: number;
  success: boolean;
  result: T;
  errors: ApiError[];
  result_info?: { page?: number; per_page?: number; count?: number; total_count?: number };
};
export type Query = Record<string, string | number | boolean | undefined>;
export type RequestOptions = { query?: Query; body?: unknown };

/** The slice of the Cloudflare REST API the domains commands use. Tests swap in a simulator. */
export interface CloudflareApi {
  request<T = unknown>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
}

export class CloudflareApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly errors: ApiError[],
  ) {
    super(`${method} ${path} -> ${status}: ${errors.map((error) => `[${error.code}] ${error.message}`).join("; ") || "no error detail"}`);
    this.name = "CloudflareApiError";
  }
}

export const apiBase = "https://api.cloudflare.com/client/v4";

export function queryString(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Real client. The token only ever comes from the environment. */
export function createCloudflareApi(token: string, fetchImpl: typeof fetch = fetch): CloudflareApi {
  return {
    async request<T>(method: string, path: string, options: RequestOptions = {}) {
      const response = await fetchImpl(`${apiBase}${path}${queryString(options.query)}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const json = (await response.json().catch(() => ({}))) as Partial<ApiResponse<T>>;
      return {
        status: response.status,
        success: json.success ?? response.ok,
        result: json.result as T,
        errors: json.errors ?? [],
        result_info: json.result_info,
      };
    },
  } as CloudflareApi;
}

export type Throttle = { minIntervalMs: number; rateLimitPauseMs: number; maxRateLimitRetries?: number; sleep?: (ms: number) => Promise<void>; now?: () => number; onPause?: (ms: number) => void };

/**
 * Spaces requests to stay under 1,200 per 5 minutes and, on a 429, waits out Cloudflare's
 * 5-minute block before retrying.
 */
export function throttled(api: CloudflareApi, throttle: Throttle): CloudflareApi {
  const sleep = throttle.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = throttle.now ?? Date.now;
  const retries = throttle.maxRateLimitRetries ?? 2;
  let last = -Infinity;
  return {
    async request(method, path, options) {
      for (let attempt = 0; ; attempt++) {
        const wait = last + throttle.minIntervalMs - now();
        if (wait > 0) await sleep(wait);
        last = now();
        const response = await api.request(method, path, options);
        if (response.status !== 429 || attempt >= retries) return response as never;
        throttle.onPause?.(throttle.rateLimitPauseMs);
        await sleep(throttle.rateLimitPauseMs);
      }
    },
  };
}

export type Credentials = { token: string; accountId: string };

export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Credentials | null {
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  return token && accountId ? { token, accountId } : null;
}

/** GET that treats 404 as "absent" and any other failure as an error. */
export async function getOrNull<T>(api: CloudflareApi, path: string, query?: Query): Promise<T | null> {
  const response = await api.request<T>("GET", path, { query });
  if (response.status === 404) return null;
  if (!response.success) throw new CloudflareApiError("GET", path, response.status, response.errors);
  return response.result;
}

export async function must<T>(api: CloudflareApi, method: "GET" | "POST" | "PATCH" | "PUT", path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  const response = await api.request<T>(method, path, options);
  if (!response.success) throw new CloudflareApiError(method, path, response.status, response.errors);
  return response;
}
