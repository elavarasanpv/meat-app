import { Linking } from "react-native";

/** Public Terms & Privacy pages, served by the admin site. */
export const LEGAL_BASE = "https://admin.thanjozmart.com";
export const openLegal = (page: "terms" | "privacy") => Linking.openURL(`${LEGAL_BASE}/${page}`).catch(() => {});
