import { useCallback, useState } from "react";
import { RefreshControl } from "react-native";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTheme } from "@/theme";

/**
 * Pull down to refresh the given queries. The spinner shows only for the pull
 * itself, not for background polling or realtime updates.
 */
export function usePullRefresh(keys: QueryKey[]) {
  const qc = useQueryClient();
  const { c } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(keys.map((queryKey) => qc.refetchQueries({ queryKey, type: "active" })));
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, JSON.stringify(keys)]);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[c.primary]} tintColor={c.primary} progressBackgroundColor={c.surface} />;
}
