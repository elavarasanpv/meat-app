import type { ImageSourcePropType } from "react-native";
import { supabase } from "./supabase";

/** Shared cut-outs from @freshcut/assets, used until every product has an uploaded image. */
const bundled = {
  countryChicken: require("@freshcut/assets/images/country-chicken.png") as ImageSourcePropType,
  broilerChicken: require("@freshcut/assets/images/broiler-chicken.png") as ImageSourcePropType,
  mutton: require("@freshcut/assets/images/mutton.png") as ImageSourcePropType,
  muttonBoneless: require("@freshcut/assets/images/mutton-boneless.png") as ImageSourcePropType,
  eggsTray: require("@freshcut/assets/images/eggs-tray.png") as ImageSourcePropType,
  farmEggs: require("@freshcut/assets/images/farm-eggs.png") as ImageSourcePropType,
  countryEggs: require("@freshcut/assets/images/country-eggs.png") as ImageSourcePropType,
  wholeChicken: require("@freshcut/assets/images/whole-chicken.png") as ImageSourcePropType,
  curryCut: require("@freshcut/assets/images/curry-cut.png") as ImageSourcePropType,
  skinlessCurryCut: require("@freshcut/assets/images/skinless-curry-cut.png") as ImageSourcePropType,
  breastPiece: require("@freshcut/assets/images/breast-piece.png") as ImageSourcePropType,
  legPiece: require("@freshcut/assets/images/leg-piece.png") as ImageSourcePropType,
  wings: require("@freshcut/assets/images/wings.png") as ImageSourcePropType,
  chickenBoneless: require("@freshcut/assets/images/chicken-boneless.png") as ImageSourcePropType,
  countryHenWhole: require("@freshcut/assets/images/country-hen-whole.png") as ImageSourcePropType,
  countryCockWhole: require("@freshcut/assets/images/country-cock-whole.png") as ImageSourcePropType,
  countryHenCut: require("@freshcut/assets/images/country-hen-cut.png") as ImageSourcePropType,
  countryCockCut: require("@freshcut/assets/images/country-cock-cut.png") as ImageSourcePropType,
  // live animals for group headers
  animalCountryHen: require("@freshcut/assets/images/animal-country-hen.png") as ImageSourcePropType,
  animalBroilerHen: require("@freshcut/assets/images/animal-broiler-hen.png") as ImageSourcePropType,
  animalGoat: require("@freshcut/assets/images/animal-goat.png") as ImageSourcePropType,
};

/** Same name-matching as the customer app, so both apps show the same picture for a product. */
export function productImage(name: string, imagePath: string | null): ImageSourcePropType | undefined {
  if (imagePath) return { uri: supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl };
  const n = name.toLowerCase();
  if (n.includes("egg")) return n.includes("country") ? bundled.countryEggs : bundled.farmEggs;
  if (n.includes("mutton") || n.includes("goat")) return n.includes("boneless") ? bundled.muttonBoneless : bundled.mutton;
  if (n.includes("country")) {
    const cock = n.includes("cock");
    if (n.includes("cut")) return cock ? bundled.countryCockCut : bundled.countryHenCut;
    if (n.includes("whole")) return cock ? bundled.countryCockWhole : bundled.countryHenWhole;
    return bundled.countryChicken;
  }
  if (n.includes("leg")) return bundled.legPiece;
  if (n.includes("breast")) return bundled.breastPiece;
  if (n.includes("wing")) return bundled.wings;
  if (n.includes("curry")) return n.includes("skinless") ? bundled.skinlessCurryCut : bundled.curryCut;
  if (n.includes("boneless") || n.includes("cube")) return bundled.chickenBoneless;
  if (n.includes("whole")) return bundled.wholeChicken;
  if (n.includes("chicken")) return bundled.broilerChicken;
  return undefined;
}

/** Picture for a sub-category header (Broiler chicken / Country chicken). */
export function subcategoryImage(name: string, imagePath: string | null | undefined): ImageSourcePropType | undefined {
  if (imagePath) return { uri: supabase.storage.from("product-images").getPublicUrl(imagePath).data.publicUrl };
  const n = name.toLowerCase();
  if (n.includes("country")) return bundled.animalCountryHen;
  if (n.includes("broiler") || n.includes("chicken")) return bundled.animalBroilerHen;
  return undefined;
}

/** Picture for a category group header (the live animal, not the cut). */
export function categoryImage(name: string): ImageSourcePropType | undefined {
  const n = name.toLowerCase();
  if (n.includes("chicken")) return bundled.animalBroilerHen;
  if (n.includes("mutton")) return bundled.animalGoat;
  if (n.includes("egg")) return bundled.eggsTray;
  return undefined;
}
