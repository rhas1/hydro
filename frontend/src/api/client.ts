const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "hydro.token";

export const UNAUTHORIZED_EVENT = "hydro:unauthorized";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
}

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "" && value !== false) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `${BASE_URL}/api${path}${qs ? `?${qs}` : ""}`;
}

function errorMessage(status: number, payload: unknown): string {
  const detail = (payload as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc: [...], msg: "..."}]
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = d.loc?.filter((p) => typeof p === "string" && p !== "body").join(" ");
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join("; ");
  }
  if (status >= 500) return "The server ran into a problem. Please try again.";
  return `Request failed (${status})`;
}

async function send(path: string, { method = "GET", body, query }: RequestOptions = {}) {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the Hydro server. Check your connection (and Tailscale).");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(response.status, errorMessage(response.status, payload));
  }
  return response;
}

export async function api<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiBlob(path: string): Promise<Blob> {
  return (await send(path)).blob();
}
