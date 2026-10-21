import type { ImageSourcePropType } from "react-native";
import { supabase } from "./supabase";

/** Bundled cut-outs used until every product has an uploaded image. */
export const bundled = {
  allMeats: require("../../assets/images/all-meats.png") as ImageSourcePropType,
  countryChicken: require("../../assets/images/country-chicken.png") as ImageSourcePropType,
  broilerChicken: require("../../assets/images/broiler-chicken.png") as ImageSourcePropType,
  mutton: require("../../assets/images/mutton.png") as ImageSourcePropType,
  muttonBoneless: require("../../assets/images/mutton-boneless.png") as ImageSourcePropType,
  eggsTray: require("../../assets/images/eggs-tray.png") as ImageSourcePropType,
  farmEggs: require("../../assets/images/farm-eggs.png") as ImageSourcePropType,
  countryEggs: require("../../assets/images/country-eggs.png") as ImageSourcePropType,
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
  if (n.includes("egg")) return n.includes("country") ? bundled.countryEggs : bundled.farmEggs;
  if (n.includes("country")) return bundled.countryChicken;
  if (n.includes("chicken")) return bundled.broilerChicken;
  if (n.includes("boneless")) return bundled.muttonBoneless;
  if (n.includes("mutton") || n.includes("goat")) return bundled.mutton;
  return undefined;
}

/** Image for a category bubble (null id = "All"). */
export function categoryImage(name: string | null): ImageSourcePropType | undefined {
  if (name === null) return bundled.allMeats;
  const n = name.toLowerCase();
  if (n.includes("chicken")) return bundled.broilerChicken;
  if (n.includes("mutton")) return bundled.mutton;
  if (n.includes("egg")) return bundled.eggsTray;
  return undefined;
}
