import { Redirect, useRouter } from "expo-router";
import { EmptyCart } from "@/components/EmptyCart";
import { useCart } from "@/store/cart";
import { Accent } from "@/theme";

export default function CartScreen() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const grocery = useCart((s) => s.active) === "grocery";

  // Empty: drawn in the colours and pictures of the section the customer is in.
  if (items.length === 0) return <Accent value={grocery ? "grocery" : "meat"}><EmptyCart onBrowse={() => router.push("/(tabs)")} /></Accent>;

  // A basket opens as its own full-screen page (no tab bar); only the empty state lives in the tab.
  return <Redirect href={grocery ? "/grocery/cart" : "/meat/cart"} />;
}
