import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Linking, PanResponder, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Notifications, registerForPush } from "@/lib/push";
import { useT } from "@/i18n";
import { Btn, Txt, useC } from "@/ui";

/** Closed with X: stays away until the app is next started. */
let closedThisRun = false;

/**
 * A floating red popup, over every screen, when this phone blocks our
 * notifications: with them off a shop never hears a new order (and a rider a
 * new delivery) while the app is closed. It can be dragged out of the way or
 * closed with X. Re-checked whenever the app comes back to the front, e.g. from Settings.
 */
export function AlertsOffBanner({ role }: { role: "dealer" | "rider" }) {
  const c = useC();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [off, setOff] = useState(false);
  const [closed, setClosed] = useState(closedThisRun);
  const [canAsk, setCanAsk] = useState(true);

  const pan = useRef(new Animated.ValueXY()).current;
  const drag = useRef(
    PanResponder.create({
      // Only a real drag moves it, so taps still reach the buttons inside.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        pan.extractOffset();
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => pan.flattenOffset(),
      onPanResponderTerminate: () => pan.flattenOffset(),
    }),
  ).current;

  const check = () => {
    Notifications?.getPermissionsAsync()
      .then((p) => {
        setOff(p.status !== "granted");
        setCanAsk(p.canAskAgain);
      })
      .catch(() => {});
  };
  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, []);

  const close = () => {
    closedThisRun = true;
    setClosed(true);
  };

  const turnOn = async () => {
    // Android asks only a couple of times; after that the switch is in the phone's Settings.
    if (canAsk && Notifications) {
      const p = await Notifications.requestPermissionsAsync();
      if (p.status === "granted") {
        setOff(false);
        void registerForPush(t("pushChannelName"));
        return;
      }
      setCanAsk(p.canAskAgain);
      if (p.canAskAgain) return;
    }
    void Linking.openSettings();
  };

  if (!off || closed) return null;
  return (
    <Animated.View
      {...drag.panHandlers}
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        top: insets.top + 60,
        transform: pan.getTranslateTransform(),
        padding: 14,
        paddingTop: 10,
        borderRadius: 22,
        backgroundColor: c.surface,
        borderWidth: 2,
        borderColor: c.danger,
        gap: 12,
        elevation: 12,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      }}
    >
      {/* Grab handle: shows it can be moved */}
      <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
          <Icon name="bell" color={c.danger} size={22} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt bold size={16} color={c.danger}>{t("alertsOff")}</Txt>
          <Txt size={13} muted>{t(role === "dealer" ? "alertsOffShop" : "alertsOffRider")}</Txt>
        </View>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("close")} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }}>
          <Icon name="x" color={c.ink} size={16} />
        </Pressable>
      </View>
      <Btn label={t("alertsTurnOn")} kind="danger" onPress={turnOn} />
    </Animated.View>
  );
}
