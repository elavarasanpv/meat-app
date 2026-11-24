import { Image } from "react-native";

const BASKET = require("@thanjozmart/assets/images/empty-basket.webp");

/**
 * Empty-cart illustration: the Thanjoz Mart line-drawn basket with a "0" tag,
 * in the same single-orange line style as the other illustrations.
 */
export function EmptyBasket({ size = 220 }: { size?: number }) {
  return <Image source={BASKET} accessible={false} resizeMode="contain" style={{ width: size, height: size * (534 / 720) }} />;
}
