import { Redirect, useRouter } from "expo-router";
import { EmptyCart } from "@/components/EmptyCart";
import { useCart } from "@/store/cart";

export default function CartScreen() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const grocery = useCart((s) => s.active) === "grocery";

  if (items.length === 0) return <EmptyCart onBrowse={() => router.push("/(tabs)")} />;

  // A basket opens as its own full-screen page (no tab bar); only the empty state lives in the tab.
  return <Redirect href={grocery ? "/grocery/cart" : "/meat/cart"} />;
}
