import { Image } from "react-native";

const BASKET = require("@freshcut/assets/images/empty-basket.png");

/**
 * Empty-cart illustration: the FreshCut line-drawn basket with a "0" tag,
 * in the same single-orange line style as the other illustrations.
 */
export function EmptyBasket({ size = 220 }: { size?: number }) {
  return <Image source={BASKET} accessible={false} resizeMode="contain" style={{ width: size, height: size * (534 / 720) }} />;
}
