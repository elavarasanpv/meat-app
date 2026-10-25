import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, View } from "react-native";
import { CANCEL_REASONS, type CancelReason } from "@freshcut/shared";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { useT, type TKey } from "@/i18n";
import { radius, useTheme } from "@/theme";

type Props = {
  visible: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: CancelReason) => void;
};

/** Slide-up confirmation with a reason picker; "Keep order" is the easy default. */
export function CancelSheet({ visible, busy, error, onClose, onConfirm }: Props) {
  const { c } = useTheme();
  const t = useT();
  const [reason, setReason] = useState<CancelReason>("mistake");
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [360, 0] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(20,8,4,0.45)", opacity: progress }}>
        <Pressable onPress={busy ? undefined : onClose} style={{ flex: 1 }} accessibilityLabel={t("close")} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.ground, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, gap: 14, transform: [{ translateY }] }}>
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.border }} />
        <AppText variant="title" numberOfLines={1}>{t("cancelTitle")}</AppText>
        <AppText variant="caption" muted numberOfLines={1}>{t("cancelSub")}</AppText>

        <View style={{ gap: 8 }}>
          {CANCEL_REASONS.map((r) => {
            const selected = reason === r;
            return (
              <Pressable
                key={r}
                onPress={() => setReason(r)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 50, paddingHorizontal: 14, borderRadius: radius.input, borderWidth: 1.5, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.tintSoft : c.surface }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? c.primary : c.border, alignItems: "center", justifyContent: "center" }}>
                  {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary }} /> : null}
                </View>
                <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 14 }}>{t(`reason_${r}` as TKey)}</AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="caption" color={c.danger} numberOfLines={2} style={{ height: 18 }}>{error ?? ""}</AppText>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label={t("keepOrder")} variant="soft" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button label={t("confirmCancel")} onPress={() => onConfirm(reason)} loading={busy} style={{ flex: 1, backgroundColor: c.danger }} />
        </View>
      </Animated.View>
    </Modal>
  );
}
