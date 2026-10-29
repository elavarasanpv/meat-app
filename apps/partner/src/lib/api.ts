import { Platform } from "react-native";
import { supabase } from "./supabase";

const configured = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** On the Android emulator "localhost" is the phone; 10.0.2.2 is the Mac. */
function baseUrl(): string {
  if (Platform.OS === "android") return configured.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
  return configured;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Call the NestJS API with the current session token. */
export async function api<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(baseUrl() + path, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
