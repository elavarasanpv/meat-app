import { supabase } from "./supabase";

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Call the FreshCut API with the signed-in admin's token. */
export async function api<T>(path: string, init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(BASE + path, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      /* raw text */
    }
    throw new ApiError(message || `HTTP ${res.status}`, res.status);
  }
  return (text ? JSON.parse(text) : null) as T;
}
