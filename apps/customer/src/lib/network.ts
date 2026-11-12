import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager, type QueryClient } from "@tanstack/react-query";

/**
 * Offline only when the phone has no connection at all. NetInfo's extra
 * "internet reachable" probe (a fetch to a Google URL) fails or times out on
 * many Indian mobile networks while everything else works, so it is ignored:
 * trusting it froze the app with "No internet" on a connected phone.
 */
const isOnline = (s: { isConnected: boolean | null }) => s.isConnected !== false;

/**
 * Tell TanStack Query when the device is offline so queries pause instead
 * of failing, and resume (refetch) the moment connectivity returns.
 */
export function bindOnlineManager(queryClient: QueryClient) {
  let wasOnline = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      const online = isOnline(state);
      setOnline(online);
      // Right after reconnecting, DNS/radio can still be flaky and the first
      // refetch may fail; give it a moment, then retry anything that errored.
      if (online && !wasOnline) {
        setTimeout(() => {
          queryClient.invalidateQueries({ predicate: (q) => q.state.status === "error" });
          queryClient.resumePausedMutations().catch(() => {});
        }, 2500);
      }
      wasOnline = online;
    }),
  );
}

/** true while the device has no usable internet. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => setOffline(!isOnline(s)));
    return () => sub();
  }, []);
  return offline;
}

type QueryLike = { isLoading: boolean; isError: boolean; data: unknown; fetchStatus: "fetching" | "paused" | "idle" };

/** Loading = first fetch in flight; failed = errored, or paused offline with nothing cached. */
export function queryState(q: QueryLike): { loading: boolean; failed: boolean } {
  const noData = q.data === undefined;
  const paused = q.fetchStatus === "paused";
  return { loading: q.isLoading && noData && !paused, failed: (q.isError || paused) && noData };
}

/** Friendly message for a failed request. */
export function errorMessage(e: unknown, t: (k: "offlineError" | "serverError") => string): string {
  const msg = (e as Error)?.message ?? "";
  if (/network request failed|fetch failed|timeout|abort/i.test(msg)) return t("offlineError");
  return msg ? `${t("serverError")} (${msg})` : t("serverError");
}
