import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import type { DealerOrderItem } from "@/hooks/useDealer";
import { proofUrl } from "@/lib/proofPhoto";
import { useScaleCamera } from "@/store/camera";
import { useLang, useT } from "@/i18n";
import { Txt, useC } from "@/ui";
import { Icon } from "./Icon";

/**
 * One packed item: name + ordered weight, and a camera tile. Tapping opens
 * the shared scale camera; once the photo is uploaded the row shows it as a
 * thumbnail with a green tick.
 */
export function ProofRow({ orderId, item }: { orderId: string; item: DealerOrderItem }) {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const openCamera = useScaleCamera((s) => s.open);
  const [thumb, setThumb] = useState<string | null>(null);

  const name = lang === "ta" && item.products.name_ta ? item.products.name_ta : item.products.name;
  const qty = item.products.unit === "kg" ? `${item.requested_kg} ${t("kg")}` : `${Math.round(item.requested_kg)} ${t("pieces")}`;
  const done = !!item.photo_path;

  useEffect(() => {
    let alive = true;
    if (item.photo_path) proofUrl(item.photo_path).then((u) => alive && setThumb(u));
    else setThumb(null);
    return () => {
      alive = false;
    };
  }, [item.photo_path]);

  return (
    <>
      <Pressable
        onPress={() => openCamera({ orderId, orderItemId: item.id, title: `${name} · ${qty}` })}
        accessibilityRole="button"
        accessibilityLabel={`${t(done ? "retake" : "takePhoto")} · ${name}`}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 16, borderWidth: 1.5, borderColor: done ? c.success : c.border, borderStyle: done ? "solid" : "dashed", backgroundColor: pressed ? c.surface2 : done ? c.successBg : c.surface })}
      >
        <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {thumb ? <Image source={{ uri: thumb }} style={{ width: 64, height: 64 }} resizeMode="cover" /> : <Icon name="camera" color={c.primary} size={28} />}
          {done ? (
            <View style={{ position: "absolute", right: 3, bottom: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: c.success, alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" color="#FFFFFF" size={12} strokeWidth={3.2} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt bold size={15} numberOfLines={2}>{name}</Txt>
          <Txt size={13} muted>{qty}</Txt>
        </View>
        <View style={{ paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: done ? c.surface : c.primary, borderWidth: done ? 1.5 : 0, borderColor: c.success, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="camera" color={done ? c.success : "#FFFFFF"} size={16} />
          <Txt bold size={13} color={done ? c.success : "#FFFFFF"}>{t(done ? "retake" : "takePhoto")}</Txt>
        </View>
      </Pressable>
    </>
  );
}
