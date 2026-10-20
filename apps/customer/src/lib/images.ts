import type { ImageSourcePropType } from "react-native";
import { supabase } from "./supabase";

/** Bundled cut-outs used until every product has an uploaded image. */
export const bundled = {
  countryChicken: require("../../assets/images/country-chicken.png") as ImageSourcePropType,
  broilerChicken: require("../../assets/images/broiler-chicken.png") as ImageSourcePropType,
};

/**
 * Image for a product: uploaded image if it has one, otherwise a bundled
 * cut-out matched by name, otherwise none (card shows the gradient alone).
 */
export function productImage(name: string, imagePath: string | null): ImageSourcePropType | undefined {
  if (imagePath) {
    return { uri: supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl };
  }
  const n = name.toLowerCase();
  if (n.includes("country")) return bundled.countryChicken;
  if (n.includes("chicken")) return bundled.broilerChicken;
  return undefined;
}

/** Image for a category bubble. */
export function categoryImage(name: string): ImageSourcePropType | undefined {
  const n = name.toLowerCase();
  if (n.includes("chicken")) return bundled.broilerChicken;
  return undefined;
}
