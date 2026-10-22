import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { en } from "./en";
import { ta } from "./ta";

export type Lang = "en" | "ta";
export type TKey = keyof typeof en;

const dictionaries: Record<Lang, Record<TKey, string>> = { en, ta };
const STORAGE_KEY = "freshcut.lang";

type LangState = {
  lang: Lang;
  load: () => Promise<void>;
  toggle: () => void;
};

export const useLang = create<LangState>((set, get) => ({
  lang: "en",
  load: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "ta") set({ lang: saved });
    } catch {
      // storage unavailable — keep default
    }
  },
  toggle: () => {
    const next: Lang = get().lang === "en" ? "ta" : "en";
    set({ lang: next });
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  },
}));

/** Display name for a catalog row: Tamil when the language is Tamil and a translation exists. */
export function useLocalName() {
  const lang = useLang((s) => s.lang);
  return (row: { name: string; name_ta?: string | null }) => (lang === "ta" && row.name_ta ? row.name_ta : row.name);
}

/** t("key", { name: "Priya" }) → replaces {name} in the string. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: TKey, vars?: Record<string, string | number>) => {
    let text = dictionaries[lang][key] ?? en[key];
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
    return text;
  };
}
