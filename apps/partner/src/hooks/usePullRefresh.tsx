import { useCallback, useState } from "react";
import { RefreshControl } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useC } from "@/ui";

/**
 * Pull down to refresh: refetches every shop query on screen (orders, counts,
 * history, stock). The spinner shows only for the pull itself, not for the
 * background 15 s poll or realtime updates.
 */
export function usePullRefresh() {
  const qc = useQueryClient();
  const c = useC();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ queryKey: ["dealer"], type: "active" });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[c.primary]} tintColor={c.primary} progressBackgroundColor={c.surface} />;
}
