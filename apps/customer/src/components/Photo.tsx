import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, type ImageSourcePropType, type StyleProp } from "react-native";
import { resolvePhoto, useSpeed } from "@/lib/photo";

const RETRIES = 3;

/**
 * Every product, grocery and offer picture goes through here: it picks the
 * stored size that suits the box and the network (see lib/photo), keeps it in
 * the phone's disk cache, and shows the photo's blurred preview until it
 * arrives, so a slow connection never shows an empty box. A load that
 * fails (a timeout on a weak network, or Metro being slow in development)
 * tries again a few times instead of leaving the box empty.
 * `width` is the box width in dp; it defaults to a numeric style width.
 */
export function Photo({
  source,
  width,
  style,
  contentFit = "contain",
  priority,
}: {
  source: ImageSourcePropType | undefined;
  width?: number;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  priority?: "low" | "normal" | "high";
}) {
  const speed = useSpeed();
  const sw = StyleSheet.flatten(style)?.width;
  const w = width ?? (typeof sw === "number" ? sw : 200);
  const r = resolvePhoto(source, w, speed);
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const retry = () => {
    if (attempt >= RETRIES) return;
    timer.current = setTimeout(() => setAttempt((a) => a + 1), 1500 * (attempt + 1));
  };
  return (
    <Image
      key={attempt}
      onError={retry}
      source={r.source as never}
      placeholder={r.hash ? { thumbhash: r.hash } : undefined}
      placeholderContentFit={contentFit}
      contentFit={contentFit}
      transition={r.hash ? 180 : 0}
      cachePolicy="disk"
      priority={priority}
      style={style}
      accessible={false}
    />
  );
}
