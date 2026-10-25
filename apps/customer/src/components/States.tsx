import { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { useIsOffline } from "@/lib/network";
import { useT } from "@/i18n";
import { radius, useTheme } from "@/theme";

/** Pulsing placeholder block. Compose several to sketch a screen while it loads. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const { c } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[{ backgroundColor: c.surface2, borderRadius: 12, opacity: pulse }, style]} />;
}

/** Two product-card placeholders side by side (matches ProductCard sizing). */
export function ProductGridSkeleton({ cardWidth }: { cardWidth: number }) {
  const h = Math.round(cardWidth * 1.3);
  return (
    <View style={{ gap: 10 }}>
      <Skeleton style={{ width: 120, height: 22, marginLeft: 20 }} />
      <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20 }}>
        <Skeleton style={{ width: cardWidth, height: h, borderRadius: radius.card }} />
        <Skeleton style={{ width: cardWidth, height: h, borderRadius: radius.card }} />
      </View>
    </View>
  );
}

/** A stack of list-row placeholders. */
export function ListSkeleton({ rows = 3, height = 76 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} style={{ height, borderRadius: 18 }} />
      ))}
    </View>
  );
}

type StateProps = { title?: string; message?: string; icon?: IconName; onRetry?: () => void; compact?: boolean };

/** Something failed: icon, message and Retry. Says "no internet" when that's the reason. */
export function ErrorState({ title, message, icon = "bell", onRetry, compact }: StateProps) {
  const { c } = useTheme();
  const t = useT();
  const offline = useIsOffline();
  return (
    <View style={{ alignItems: "center", gap: 10, padding: compact ? 16 : 24, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
      <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={c.primary} size={26} />
      </View>
      <AppText variant="subtitle" numberOfLines={1}>{title ?? (offline ? t("offlineTitle") : t("errorTitle"))}</AppText>
      <AppText variant="caption" muted numberOfLines={3} style={{ textAlign: "center" }}>
        {message ?? (offline ? t("offlineError") : t("serverError"))}
      </AppText>
      {onRetry ? <Button label={t("retry")} size="sm" onPress={onRetry} style={{ marginTop: 4 }} /> : null}
    </View>
  );
}

/** Nothing here yet: icon, title, optional action. */
export function EmptyState({ title, message, icon = "orders", actionLabel, onAction }: { title: string; message?: string; icon?: IconName; actionLabel?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
      <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={c.primary} size={32} />
      </View>
      <AppText variant="title" numberOfLines={1}>{title}</AppText>
      {message ? <AppText muted numberOfLines={2} style={{ textAlign: "center" }}>{message}</AppText> : null}
      {actionLabel && onAction ? (
        <View style={{ width: 220, marginTop: 4 }}>
          <Button label={actionLabel} size="sm" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
