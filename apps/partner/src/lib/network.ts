import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager, useIsRestoring, useQueryClient, type QueryClient } from "@tanstack/react-query";

/**
 * Tell TanStack Query when the phone is offline so queries pause (keeping the
 * last data on screen) instead of failing, and refetch the moment the network
 * comes back.
 */
export function bindOnlineManager(queryClient: QueryClient) {
  let wasOnline = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(online);
      // Right after reconnecting the radio/DNS can still be flaky; give it a
      // moment, then retry anything that errored.
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

/** true while the phone itself reports no usable internet. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => setOffline(!(s.isConnected && s.isInternetReachable !== false)));
    return () => sub();
  }, []);
  return offline;
}

/**
 * Connection state for the banner:
 *  - "offline": the phone has no internet (airplane mode, no signal).
 *  - "server":  internet is up but our API isn't answering (server down, DNS).
 *  - null:      all good.
 * "server" is derived from the shop's live queries being in error; the data on
 * screen is then the last successful fetch, not zeros.
 */
export function useConnection(): "offline" | "server" | null {
  const offline = useIsOffline();
  const qc = useQueryClient();
  const restoring = useIsRestoring();
  const [serverDown, setServerDown] = useState(false);
  useEffect(() => {
    const check = () => {
      const qs = qc.getQueryCache().findAll({ type: "active", predicate: (q) => q.queryKey[0] === "dealer" || q.queryKey[0] === "rider" });
      // The newest result wins: a success after the last failure means the
      // server is back, even if a query that doesn't poll is still errored.
      const lastError = Math.max(0, ...qs.map((q) => (q.state.status === "error" ? q.state.errorUpdatedAt : 0)));
      const lastSuccess = Math.max(0, ...qs.map((q) => q.state.dataUpdatedAt));
      // Only update when it changes; this runs on every cache event.
      setServerDown(lastError > lastSuccess);
    };
    check();
    // Cache events can fire while another component renders; update after.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const unsub = qc.getQueryCache().subscribe(() => {
      clearTimeout(pending);
      pending = setTimeout(check, 0);
    });
    return () => {
      clearTimeout(pending);
      unsub();
    };
  }, [qc]);
  if (offline) return "offline";
  if (!restoring && serverDown) return "server";
  return null;
}
