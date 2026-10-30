import type { ImageSourcePropType } from "react-native";
import type { IconName } from "@/components/Icon";

export type JourneyStop = "placed" | "shop" | "cutting" | "packed" | "rider";

/**
 * Artwork for the order journey. Drop the generated PNGs into
 * assets/journey/ and add them here; until then the vector icon is used.
 *   frames: 2 images alternated for a simple chop / ride animation.
 */
export const JOURNEY_ART: Record<JourneyStop, { icon: IconName; frames?: ImageSourcePropType[] }> = {
  placed: { icon: "receipt" },
  shop: { icon: "shop" },
  cutting: { icon: "cut" },
  packed: { icon: "cart" },
  rider: { icon: "scooter" },
};

/** The marker that travels along the road (PNG when provided). */
export const JOURNEY_MARKER: ImageSourcePropType | null = null;
