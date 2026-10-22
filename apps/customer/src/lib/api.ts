import { Platform } from "react-native";
import { supabase } from "./supabase";

const configured = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** On the Android emulator, "localhost" is the phone itself; 10.0.2.2 is the Mac. */
function baseUrl(): string {
  if (Platform.OS === "android") return configured.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
  return configured;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Call the NestJS API with the current Supabase session token. */
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
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(json?.message) ? json.message.join(", ") : json?.message ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return json as T;
}
