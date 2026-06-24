import { clearToken, getToken } from "./auth";
import type {
  CurrentUser,
  LeadList,
  LeadRead,
  LeadState,
  ListLeadsParams,
  TokenResponse,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

/** Typed error thrown by all API client functions. */
export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Raised on a 401 so callers can clear the session and redirect. */
export class UnauthorizedError extends ApiError {
  constructor(detail = "Your session has expired. Please sign in again.") {
    super(401, detail);
    this.name = "UnauthorizedError";
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Extract a human-readable error message from a FastAPI error body.
 * `detail` may be a string or a list of validation errors.
 */
async function extractDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((e: { loc?: (string | number)[]; msg?: string }) => {
          const field = Array.isArray(e.loc)
            ? e.loc.filter((p) => p !== "body").join(".")
            : "";
          return field ? `${field}: ${e.msg}` : e.msg;
        })
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    /* fall through */
  }
  return res.statusText || "Request failed";
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }
  const detail = await extractDetail(res);
  if (res.status === 401) {
    clearToken();
    throw new UnauthorizedError(detail);
  }
  throw new ApiError(res.status, detail);
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export interface CreateLeadInput {
  first_name: string;
  last_name: string;
  email: string;
  resume: File;
}

export async function createLead(input: CreateLeadInput): Promise<LeadRead> {
  const form = new FormData();
  form.append("first_name", input.first_name);
  form.append("last_name", input.last_name);
  form.append("email", input.email);
  form.append("resume", input.resume);

  const res = await fetch(`${API_BASE_URL}/api/leads`, {
    method: "POST",
    body: form,
  });
  return handle<LeadRead>(res);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(
  email: string,
  password: string,
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handle<TokenResponse>(res);
}

export async function getMe(): Promise<CurrentUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { ...authHeaders() },
  });
  return handle<CurrentUser>(res);
}

// ---------------------------------------------------------------------------
// Leads (protected)
// ---------------------------------------------------------------------------

export async function listLeads(params: ListLeadsParams): Promise<LeadList> {
  const qs = new URLSearchParams();
  if (params.state) qs.set("state", params.state);
  if (params.search) qs.set("search", params.search);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));

  const res = await fetch(`${API_BASE_URL}/api/leads?${qs.toString()}`, {
    headers: { ...authHeaders() },
  });
  return handle<LeadList>(res);
}

export async function getLead(id: string): Promise<LeadRead> {
  const res = await fetch(`${API_BASE_URL}/api/leads/${id}`, {
    headers: { ...authHeaders() },
  });
  return handle<LeadRead>(res);
}

export async function updateLeadState(
  id: string,
  state: LeadState,
): Promise<LeadRead> {
  const res = await fetch(`${API_BASE_URL}/api/leads/${id}/state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ state }),
  });
  return handle<LeadRead>(res);
}

/**
 * Download a resume. The endpoint is authed, so we fetch a blob with the
 * bearer header and trigger a browser download client-side.
 */
export async function downloadResume(lead: {
  id: string;
  resume_filename: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/leads/${lead.id}/resume`, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const detail = await extractDetail(res);
    if (res.status === 401) {
      clearToken();
      throw new UnauthorizedError(detail);
    }
    throw new ApiError(res.status, detail);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = lead.resume_filename || `resume-${lead.id}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
