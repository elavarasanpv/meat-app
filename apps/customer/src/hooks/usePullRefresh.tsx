import { useCallback, useState } from "react";
import { Platform, RefreshControl } from "react-native";

/** Pull this far (dp) before a refresh starts; iOS ignores it and uses its own gesture. */
const PULL_DISTANCE = Platform.OS === "android" ? 90 : 0;
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
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[c.primary]}
      tintColor={c.primary}
      progressBackgroundColor={c.surface}
      // Android fires on a short tug by default; a bigger offset means the
      // owner must pull a good way down before it triggers.
      progressViewOffset={PULL_DISTANCE}
    />
  );
}
