import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, View } from "react-native";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  /** Label of the destructive / primary action. */
  confirmLabel: string;
  cancelLabel?: string;
  icon?: IconName;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Themed yes/no sheet (replaces the stock Android Alert): slides up from the
 * bottom with the app's radius, fonts and colours. The safe choice is on the
 * left in the soft style; the action is on the right, red when destructive.
 */
export function ConfirmSheet({ visible, title, message, confirmLabel, cancelLabel, icon = "trash", destructive = true, busy, onConfirm, onClose }: Props) {
  const { c } = useTheme();
  const t = useT();
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

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const tone = destructive ? c.danger : c.primary;
  const toneBg = destructive ? c.tintSoft : c.tint;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(20,8,4,0.45)", opacity: progress }}>
        <Pressable onPress={busy ? undefined : onClose} style={{ flex: 1 }} accessibilityLabel={t("close")} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.ground, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, gap: 14, transform: [{ translateY }] }}>
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.border }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 4 }}>
          <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: toneBg, alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} color={tone} size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={2} style={{ fontSize: 19, lineHeight: 24 }}>{title}</AppText>
            {message ? <AppText variant="caption" muted numberOfLines={2} style={{ marginTop: 2 }}>{message}</AppText> : null}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <Button label={cancelLabel ?? t("cancel")} variant="soft" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button label={confirmLabel} icon={icon} onPress={onConfirm} loading={busy} style={{ flex: 1, backgroundColor: tone }} />
        </View>
      </Animated.View>
    </Modal>
  );
}
