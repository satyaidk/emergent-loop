// Every call the web app makes to the LearnLoop server lives here, so components never
// build URLs or parse errors themselves.

import type { AppInfo, ChatResponse, Health, MemoryNote, ProgressReport } from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ChatRequest {
  user_id: string;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  use_memory: boolean;
  suggest_followups: boolean;
}

export const api = {
  chat: (body: ChatRequest, signal?: AbortSignal) =>
    request<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify(body), signal }),

  health: () => request<Health>("/healthz"),

  info: () => request<AppInfo>("/api/info"),

  memories: async (learnerId: string) =>
    (await request<{ memories: MemoryNote[] }>(`/api/users/${encodeURIComponent(learnerId)}/memories`)).memories,

  report: (learnerId: string) => request<ProgressReport>(`/api/users/${encodeURIComponent(learnerId)}/report`),

  starters: async (learnerId: string, count = 4) =>
    (await request<{ suggestions: string[] }>(`/api/users/${encodeURIComponent(learnerId)}/starters?count=${count}`))
      .suggestions,

  forget: (learnerId: string) =>
    request<void>(`/api/users/${encodeURIComponent(learnerId)}/memories`, { method: "DELETE" }),
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Can't reach the LearnLoop server. Check that it's running, then try again.", 0);
  }
  if (!response.ok) throw new ApiError(await errorMessage(response), response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Turns a failed response into one readable sentence, whatever shape the body has. */
export async function errorMessage(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    // FastAPI validation errors: [{ loc: [...], msg: "..." }, ...]
    if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return detail[0].msg;
  } catch {
    // not JSON: fall through
  }
  if (body.trim()) return body.trim().slice(0, 200);
  return `The server returned an empty reply (HTTP ${response.status}). It may still be starting up.`;
}
