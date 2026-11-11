import { Linking } from "react-native";

/** Public Terms & Privacy pages, served by the admin site. */
export const LEGAL_BASE = "https://freshcut-admin.vercel.app";
export const openLegal = (page: "terms" | "privacy") => Linking.openURL(`${LEGAL_BASE}/${page}`).catch(() => {});
