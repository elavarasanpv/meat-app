import type { ImageSourcePropType } from "react-native";
import { supabase } from "./supabase";

/** Bundled cut-outs used until every product has an uploaded image. */
export const bundled = {
  allMeats: require("@thanjozmart/assets/images/all-meats.webp") as ImageSourcePropType,
  countryChicken: require("@thanjozmart/assets/images/country-chicken.webp") as ImageSourcePropType,
  broilerChicken: require("@thanjozmart/assets/images/broiler-chicken.webp") as ImageSourcePropType,
  mutton: require("@thanjozmart/assets/images/mutton.webp") as ImageSourcePropType,
  muttonBoneless: require("@thanjozmart/assets/images/mutton-boneless.webp") as ImageSourcePropType,
  eggsTray: require("@thanjozmart/assets/images/eggs-tray.webp") as ImageSourcePropType,
  farmEggs: require("@thanjozmart/assets/images/farm-eggs.webp") as ImageSourcePropType,
  countryEggs: require("@thanjozmart/assets/images/country-eggs.webp") as ImageSourcePropType,
  // chicken cuts
  wholeChicken: require("@thanjozmart/assets/images/whole-chicken.webp") as ImageSourcePropType,
  curryCut: require("@thanjozmart/assets/images/curry-cut.webp") as ImageSourcePropType,
  skinlessCurryCut: require("@thanjozmart/assets/images/skinless-curry-cut.webp") as ImageSourcePropType,
  breastPiece: require("@thanjozmart/assets/images/breast-piece.webp") as ImageSourcePropType,
  legPiece: require("@thanjozmart/assets/images/leg-piece.webp") as ImageSourcePropType,
  wings: require("@thanjozmart/assets/images/wings.webp") as ImageSourcePropType,
  chickenBoneless: require("@thanjozmart/assets/images/chicken-boneless.webp") as ImageSourcePropType,
  // country chicken
  countryHenWhole: require("@thanjozmart/assets/images/country-hen-whole.webp") as ImageSourcePropType,
  countryCockWhole: require("@thanjozmart/assets/images/country-cock-whole.webp") as ImageSourcePropType,
  countryHenCut: require("@thanjozmart/assets/images/country-hen-cut.webp") as ImageSourcePropType,
  countryCockCut: require("@thanjozmart/assets/images/country-cock-cut.webp") as ImageSourcePropType,
};

/** Studio photos for the "For you" banners. */
const banners = {
  muttonCurry: require("@thanjozmart/assets/images/banner-mutton-curry.webp") as ImageSourcePropType,
  muttonBoneless: require("@thanjozmart/assets/images/banner-mutton-boneless.webp") as ImageSourcePropType,
  chickenCurry: require("@thanjozmart/assets/images/banner-chicken-curry.webp") as ImageSourcePropType,
  countryChicken: require("@thanjozmart/assets/images/banner-country-chicken.webp") as ImageSourcePropType,
  eggs: require("@thanjozmart/assets/images/banner-eggs.webp") as ImageSourcePropType,
  combo: require("@thanjozmart/assets/images/banner-combo.webp") as ImageSourcePropType,
  popular: require("@thanjozmart/assets/images/banner-popular.webp") as ImageSourcePropType,
};

/** Banner photo for a product, or undefined when we don't have one yet (caller falls back to productImage). */
export function bannerImage(name: string): ImageSourcePropType | undefined {
  const n = name.toLowerCase();
  if (n.includes("egg")) return banners.eggs;
  if (n.includes("mutton") || n.includes("goat")) return n.includes("boneless") ? banners.muttonBoneless : banners.muttonCurry;
  if (n.includes("country")) return banners.countryChicken;
  if (n.includes("chicken") || n.includes("curry") || n.includes("leg") || n.includes("breast") || n.includes("wing")) return banners.chickenCurry;
  return undefined;
}

/** Banner photo for a whole suggestion: the combo spread for a multi-item basket, the whole-chicken plate for "popular near you". */
export function suggestionImage(kind: "habit" | "favourite" | "last" | "popular", items: { name: string; imagePath: string | null }[]): ImageSourcePropType | undefined {
  if (kind === "popular") return banners.popular;
  if (items.length > 1) return banners.combo;
  const first = items[0];
  return first ? (bannerImage(first.name) ?? productImage(first.name, first.imagePath)) : undefined;
}

/**
 * Image for a product: uploaded image if it has one, otherwise a bundled
 * cut-out matched by name, otherwise none (card shows the gradient alone).
 */
/** Grocery items: the master product image or nothing (the row shows an initial). Never the meat name-match fallbacks. */
export function groceryImage(imagePath: string | null | undefined): ImageSourcePropType | undefined {
  return imagePath ? { uri: supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl } : undefined;
}

/** Same as groceryImage: <Photo> picks the 160/300/800 px file for the box, so callers always pass the main path. */
export const groceryThumb = groceryImage;

/** Image for a cart line, whichever vertical it came from. */
export function cartImage(it: { name: string; imagePath?: string | null; vertical?: "meat" | "grocery" }): ImageSourcePropType | undefined {
  return it.vertical === "grocery" ? groceryImage(it.imagePath) : productImage(it.name, null);
}

export function productImage(name: string, imagePath: string | null): ImageSourcePropType | undefined {
  if (imagePath) {
    return { uri: supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl };
  }
  const n = name.toLowerCase();
  if (n.includes("egg")) return n.includes("country") ? bundled.countryEggs : bundled.farmEggs;
  if (n.includes("mutton") || n.includes("goat")) {
    return n.includes("boneless") ? bundled.muttonBoneless : bundled.mutton;
  }
  if (n.includes("country")) {
    const cock = n.includes("cock");
    if (n.includes("cut")) return cock ? bundled.countryCockCut : bundled.countryHenCut;
    if (n.includes("whole")) return cock ? bundled.countryCockWhole : bundled.countryHenWhole;
    return bundled.countryChicken;
  }
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
