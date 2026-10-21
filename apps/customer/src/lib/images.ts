import type { ImageSourcePropType } from "react-native";
import { supabase } from "./supabase";

/** Bundled cut-outs used until every product has an uploaded image. */
export const bundled = {
  allMeats: require("../../assets/images/all-meats.png") as ImageSourcePropType,
  countryChicken: require("../../assets/images/country-chicken.png") as ImageSourcePropType,
  broilerChicken: require("../../assets/images/broiler-chicken.png") as ImageSourcePropType,
  mutton: require("../../assets/images/mutton.png") as ImageSourcePropType,
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
  if (n.includes("mutton") || n.includes("goat")) return bundled.mutton;
  return undefined;
}

/** Image for a category bubble (null id = "All"). */
export function categoryImage(name: string | null): ImageSourcePropType | undefined {
  if (name === null) return bundled.allMeats;
  const n = name.toLowerCase();
  if (n.includes("chicken")) return bundled.broilerChicken;
  if (n.includes("mutton")) return bundled.mutton;
  return undefined;
}
