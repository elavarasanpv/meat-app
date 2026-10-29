import { useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useItemPhoto } from "@/hooks/useDealer";
import { uploadProof } from "@/lib/proofPhoto";
import { useScaleCamera } from "@/store/camera";
import { useT } from "@/i18n";
import { Btn, Txt, useC } from "@/ui";
import { Icon } from "./Icon";

export type Shot = { uri: string; width: number; height: number };

/**
 * Our own full-screen camera for the scale photo:
 *  1. ask for camera access in our words (system prompt only after "Allow"),
 *  2. live preview with a frame guide — "packet on the scale, weight visible",
 *  3. big shutter → review the shot → Retake or Use photo (uploads here).
 */
export function ScaleCamera() {
  const c = useC();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useScaleCamera((s) => s.request);
  const closeStore = useScaleCamera((s) => s.close);
  const save = useItemPhoto();
  const visible = !!request;
  const title = request?.title ?? "";

  const close = () => {
    setShot(null);
    setError(null);
    closeStore();
  };

  async function snap() {
    if (!cam.current || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const p = await cam.current.takePictureAsync({ quality: 0.8 });
    if (p) setShot({ uri: p.uri, width: p.width, height: p.height });
  }

  async function use() {
    if (!shot || !request) return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadProof(request.orderId, request.orderItemId, shot);
      await save.mutateAsync({ orderId: request.orderId, orderItemId: request.orderItemId, photoPath: path });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      close();
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  const Header = (
    <View style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t("back")} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
        <Icon name="x" color="#FFFFFF" size={22} />
      </Pressable>
      <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.45)" }}>
        <Txt bold size={15} color="#FFFFFF" numberOfLines={1}>{title}</Txt>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {!perm ? null : !perm.granted ? (
          // Our own permission screen, then the system prompt.
          <View style={{ flex: 1, backgroundColor: c.ground, padding: 28, justifyContent: "center", gap: 16 }}>
            <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
              <Icon name="camera" color={c.primary} size={36} />
            </View>
            <Txt bold size={22}>{t("camTitle")}</Txt>
            <Txt muted>{t("camWhy")}</Txt>
            <Btn
              label={perm.canAskAgain ? t("camAllow") : t("camSettings")}
              icon="camera"
              big
              onPress={() => (perm.canAskAgain ? requestPerm() : Linking.openSettings())}
            />
            <Btn label={t("back")} kind="soft" big onPress={close} />
          </View>
        ) : shot ? (
          // Review the shot
          <View style={{ flex: 1 }}>
            <Image source={{ uri: shot.uri }} style={{ flex: 1 }} resizeMode="contain" />
            {Header}
            <View style={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 10, backgroundColor: c.ground }}>
              <Txt bold size={16}>{t("camCheck")}</Txt>
              {error ? <Txt size={13} color={c.danger}>{error}</Txt> : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Btn label={t("retake")} icon="camera" kind="outline" big onPress={() => setShot(null)} disabled={busy} style={{ flex: 1 }} />
                <Btn label={t("usePhoto")} icon="check" kind="success" big onPress={use} loading={busy} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        ) : (
          // Live preview
          <View style={{ flex: 1 }}>
            <CameraView ref={cam} style={{ flex: 1 }} facing="back" />
            {Header}
            {/* frame guide */}
            <View pointerEvents="none" style={{ position: "absolute", left: 32, right: 32, top: "22%", bottom: "30%", borderRadius: 24, borderWidth: 3, borderColor: "rgba(255,255,255,0.85)", borderStyle: "dashed" }} />
            <View pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 140, alignItems: "center" }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.55)" }}>
                <Txt bold size={14} color="#FFFFFF" style={{ textAlign: "center" }}>{t("camGuide")}</Txt>
              </View>
            </View>
            <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 28, alignItems: "center" }}>
              <Pressable onPress={snap} accessibilityRole="button" accessibilityLabel={t("takePhoto")} style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.primary }} />
              </Pressable>
            </View>
          </View>
        )}
        {perm === null ? <ActivityIndicator style={{ flex: 1 }} color="#FFFFFF" /> : null}
      </View>
    </Modal>
  );
}
