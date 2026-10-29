import { Image } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/** Line-art cleaver on a board (supplied artwork); black on transparent so it tints to any colour. */
const CUTTING = require("@freshcut/assets/images/icon-cutting.png");

export type IconName =
  | "home" | "inbox" | "clock" | "history" | "stock" | "shop" | "check" | "logout" | "scooter" | "phone" | "chevronRight" | "bell" | "cut" | "x";

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number; filled?: boolean };

/** Rounded stroke icons on a 24×24 grid, matching the customer app. */
export function Icon({ name, size = 22, color, strokeWidth = 2.2, filled }: Props) {
  // Raster artwork: tintColor recolours the black strokes to the requested colour.
  if (name === "cut") return <Image source={CUTTING} style={{ width: size, height: size, tintColor: color }} resizeMode="contain" />;
  const p = { stroke: color, strokeWidth, fill: filled ? color : "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const line = { ...p, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "home" && <Path d="M3.5 11 12 3.5l8.5 7.5V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" {...p} />}
      {name === "inbox" && (<><Path d="M4 5h16v14H4z" {...p} /><Path d="M4 14h5l1.5 2h3L15 14h5" {...line} stroke={filled ? "#FFFFFF" : color} /></>)}
      {name === "clock" && (<><Circle cx={12} cy={12} r={9} {...p} /><Path d="M12 7v5l3 2" {...line} stroke={filled ? "#FFFFFF" : color} /></>)}
      {name === "history" && (<><Path d="M5.5 3.5h13v17l-2.6-1.8-2.6 1.8-1.3-1-1.3 1-2.6-1.8-2.6 1.8z" {...p} /><Path d="M9 8.5h6M9 12h6" {...line} stroke={filled ? "#FFFFFF" : color} /></>)}
      {name === "stock" && (<><Path d="M3.5 10h17l-1.8 9a1.5 1.5 0 0 1-1.5 1.2H6.8A1.5 1.5 0 0 1 5.3 19z" {...p} /><Path d="M8 10l3-5.5M16 10l-3-5.5" {...line} /><Path d="M9.5 14v3M14.5 14v3" {...line} stroke={filled ? "#FFFFFF" : color} /></>)}
      {name === "shop" && (<><Path d="M3 9.5 4.5 5h15L21 9.5" {...line} /><Path d="M3 9.5a2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0" {...line} /><Path d="M4.5 12v8h15v-8" {...p} /><Rect x={7} y={13.5} width={4.5} height={3.5} rx={0.8} {...line} stroke={filled ? "#FFFFFF" : color} /><Path d="M14 20v-6h3.5v6" {...line} stroke={filled ? "#FFFFFF" : color} /></>)}
      {name === "check" && <Path d="M5 12.5l4.5 4.5L19 7.5" {...line} />}
      {name === "x" && <Path d="M6 6l12 12M18 6L6 18" {...line} />}
      {name === "logout" && (<><Path d="M15 4h4v16h-4" {...line} /><Path d="M10 8l-4 4 4 4" {...line} /><Path d="M6 12h10" {...line} /></>)}
      {name === "scooter" && (<><Circle cx={6} cy={17} r={3} {...line} /><Circle cx={18} cy={17} r={3} {...line} /><Path d="M6 17l3-8h5l1 4h3" {...line} /><Path d="M12 5h3l1 4" {...line} /><Path d="M9 9H5" {...line} /></>)}
      {name === "phone" && <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" {...line} />}
      {name === "chevronRight" && <Path d="M9 6l6 6-6 6" {...line} />}
      {name === "bell" && (<><Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" {...line} /><Path d="M10 21h4" {...line} /></>)}
    </Svg>
  );
}
