import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/** Dealer-facing strings. Tamil first for the launch area; English for testing. */
const STRINGS = {
  en: {
    appName: "FreshCut Shop",
    loginTitle: "Shop login",
    loginSub: "Use the phone number registered for your shop",
    phone: "Phone number",
    sendOtp: "Get OTP",
    otp: "Enter the 6-digit OTP",
    verify: "Verify",
    loginFailed: "Couldn't log in. Check the number and try again.",
    notDealer: "This number is not registered as a shop. Call support.",
    shopOpen: "Shop is OPEN",
    shopClosed: "Shop is CLOSED",
    tabOrders: "Orders",
    tabStock: "Stock",
    newOrder: "New order",
    preparing: "Preparing",
    ready: "Ready for pickup",
    noOrders: "No orders right now",
    acceptIn: "Answer in",
    items: "items",
    yourAmount: "Your amount",
    accept: "Accept",
    reject: "Reject",
    readyIn: "Ready in?",
    min: "min",
    rejectWhy: "Why reject?",
    r_out_of_stock: "Out of stock",
    r_closing: "Closing now",
    r_too_busy: "Too busy",
    r_other: "Other",
    startCutting: "Start cutting",
    weighNote: "Weigh each item and enter the exact weight",
    kg: "kg",
    pieces: "pcs",
    save: "Save",
    saved: "Saved",
    markPacked: "Packed & ready",
    waitingRider: "Waiting for the rider",
    customerNote: "Customer note",
    inStock: "In stock",
    outToday: "Out today",
    outUntilOn: "Out until I turn on",
    logout: "Log out",
    error: "Something went wrong. Try again.",
  },
  ta: {
    appName: "FreshCut கடை",
    loginTitle: "கடை உள்நுழைவு",
    loginSub: "உங்கள் கடைக்கு பதிவு செய்த எண்ணை பயன்படுத்தவும்",
    phone: "மொபைல் எண்",
    sendOtp: "OTP பெறுக",
    otp: "6 இலக்க OTP ஐ உள்ளிடவும்",
    verify: "சரிபார்",
    loginFailed: "உள்நுழைய முடியவில்லை. எண்ணை சரிபார்த்து மீண்டும் முயலவும்.",
    notDealer: "இந்த எண் கடையாக பதிவு செய்யப்படவில்லை. ஆதரவை அழைக்கவும்.",
    shopOpen: "கடை திறந்துள்ளது",
    shopClosed: "கடை மூடப்பட்டுள்ளது",
    tabOrders: "ஆர்டர்கள்",
    tabStock: "சரக்கு",
    newOrder: "புதிய ஆர்டர்",
    preparing: "தயாராகிறது",
    ready: "பிக்கப்புக்கு தயார்",
    noOrders: "இப்போது ஆர்டர்கள் இல்லை",
    acceptIn: "பதிலளிக்க",
    items: "பொருட்கள்",
    yourAmount: "உங்கள் தொகை",
    accept: "ஏற்றுக்கொள்",
    reject: "நிராகரி",
    readyIn: "எவ்வளவு நேரத்தில் தயார்?",
    min: "நிமி",
    rejectWhy: "ஏன் நிராகரிப்பு?",
    r_out_of_stock: "சரக்கு இல்லை",
    r_closing: "கடை மூடுகிறேன்",
    r_too_busy: "அதிக வேலை",
    r_other: "வேறு",
    startCutting: "வெட்ட தொடங்கு",
    weighNote: "ஒவ்வொரு பொருளையும் எடை போட்டு சரியான எடையை உள்ளிடவும்",
    kg: "கிலோ",
    pieces: "எண்",
    save: "சேமி",
    saved: "சேமித்தது",
    markPacked: "பேக் ஆனது, தயார்",
    waitingRider: "ரைடருக்காக காத்திருக்கிறது",
    customerNote: "வாடிக்கையாளர் குறிப்பு",
    inStock: "சரக்கு உள்ளது",
    outToday: "இன்று இல்லை",
    outUntilOn: "நான் திறக்கும் வரை இல்லை",
    logout: "வெளியேறு",
    error: "ஏதோ தவறு. மீண்டும் முயலவும்.",
  },
} as const;

export type TKey = keyof (typeof STRINGS)["en"];
type Lang = "en" | "ta";
const KEY = "freshcut.partner.lang";

type LangState = { lang: Lang; load: () => Promise<void>; toggle: () => void };
export const useLang = create<LangState>((set, get) => ({
  lang: "ta",
  load: async () => {
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved === "en" || saved === "ta") set({ lang: saved });
    } catch {
      /* keep default */
    }
  },
  toggle: () => {
    const lang: Lang = get().lang === "ta" ? "en" : "ta";
    set({ lang });
    AsyncStorage.setItem(KEY, lang).catch(() => {});
  },
}));

export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: TKey) => STRINGS[lang][key];
}
