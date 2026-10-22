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
  // chicken cuts
  wholeChicken: require("../../assets/images/whole-chicken.png") as ImageSourcePropType,
  curryCut: require("../../assets/images/curry-cut.png") as ImageSourcePropType,
  skinlessCurryCut: require("../../assets/images/skinless-curry-cut.png") as ImageSourcePropType,
  breastPiece: require("../../assets/images/breast-piece.png") as ImageSourcePropType,
  legPiece: require("../../assets/images/leg-piece.png") as ImageSourcePropType,
  wings: require("../../assets/images/wings.png") as ImageSourcePropType,
  chickenBoneless: require("../../assets/images/chicken-boneless.png") as ImageSourcePropType,
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
  if (n.includes("mutton") || n.includes("goat")) {
    return n.includes("boneless") ? bundled.muttonBoneless : bundled.mutton;
  }
  if (n.includes("country")) return bundled.countryChicken;
  // chicken cuts (broiler); most specific first
  if (n.includes("leg")) return bundled.legPiece;
  if (n.includes("breast")) return bundled.breastPiece;
  if (n.includes("wing")) return bundled.wings;
  if (n.includes("curry")) return n.includes("skinless") ? bundled.skinlessCurryCut : bundled.curryCut;
  if (n.includes("boneless") || n.includes("cube")) return bundled.chickenBoneless;
  if (n.includes("whole")) return bundled.wholeChicken;
  if (n.includes("chicken")) return bundled.broilerChicken;
  return undefined;
}

/** Image for a sub-category card (Broiler chicken / Country chicken). */
export function subcategoryImage(name: string, imagePath: string | null): ImageSourcePropType | undefined {
  if (imagePath) {
    return { uri: supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl };
  }
  const n = name.toLowerCase();
  if (n.includes("country")) return bundled.countryChicken;
  if (n.includes("broiler") || n.includes("chicken")) return bundled.broilerChicken;
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
