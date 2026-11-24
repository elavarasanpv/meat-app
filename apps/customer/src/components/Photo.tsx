import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import { StyleSheet, type ImageSourcePropType, type StyleProp } from "react-native";
import { resolvePhoto, useSpeed } from "@/lib/photo";

/**
 * Every product, grocery and offer picture goes through here: it picks the
 * stored size that suits the box and the network (see lib/photo), keeps it in
 * the phone's disk cache, and shows the photo's blurred preview until it
 * arrives, so a slow connection never shows an empty box.
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
  return (
    <Image
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
