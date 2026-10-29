import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
  | "search" | "mic" | "bell" | "pin" | "chevronDown" | "back" | "sparkle"
  | "home" | "orders" | "cart" | "phone" | "truck" | "logo" | "logout" | "clock" | "receipt" | "chevronUp" | "edit" | "trash" | "check" | "cut" | "scooter";

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number };

/** Stroke icons drawn to match the design canvas (24×24 grid). */
export function Icon({ name, size = 22, color, strokeWidth = 2.2 }: Props) {
  const p = { stroke: color, strokeWidth, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "search" && (<><Circle cx={11} cy={11} r={7} {...p} /><Path d="M20 20l-3.5-3.5" {...p} /></>)}
      {name === "mic" && (<><Rect x={9} y={3} width={6} height={11} rx={3} {...p} /><Path d="M5 11a7 7 0 0 0 14 0" {...p} /><Path d="M12 18v3" {...p} /></>)}
      {name === "bell" && (<><Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" {...p} /><Path d="M10 21h4" {...p} /></>)}
      {name === "pin" && (<><Path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" {...p} /><Circle cx={12} cy={10} r={2.5} {...p} /></>)}
      {name === "chevronDown" && <Path d="M6 9l6 6 6-6" {...p} />}
      {name === "back" && <Path d="M15 5l-7 7 7 7" {...p} />}
      {name === "sparkle" && (<><Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" {...p} /><Path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" {...p} /></>)}
      {name === "home" && (<><Path d="M3.5 11 12 3.5l8.5 7.5V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" {...p} /></>)}
      {name === "orders" && (<><Path d="M5 4h14v16H5z" {...p} /><Path d="M9 9h6" {...p} /><Path d="M9 13h6" {...p} /></>)}
      {name === "cart" && (<><Path d="M4 7h16l-1 13H5z" {...p} /><Path d="M9 7a3 3 0 0 1 6 0" {...p} /></>)}
      {name === "phone" && <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" {...p} />}
      {name === "truck" && (<><Path d="M3 7h11v9H3z" {...p} /><Path d="M14 10h4l3 3v3h-7z" {...p} /><Circle cx={7} cy={18} r={2} {...p} /><Circle cx={17} cy={18} r={2} {...p} /></>)}
      {name === "logo" && (<><Path d="M4 14c0-4.4 3.6-8 8-8s8 3.6 8 8v1H4z" {...p} /><Path d="M3 15h18" {...p} /><Path d="M7 15v3" {...p} /><Path d="M12 15v3" {...p} /><Path d="M17 15v3" {...p} /></>)}
      {name === "clock" && (<><Circle cx={12} cy={12} r={9} {...p} /><Path d="M12 7v5l3 2" {...p} /></>)}
      {name === "receipt" && (<><Path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" {...p} /><Path d="M9 8h6" {...p} /><Path d="M9 12h6" {...p} /></>)}
      {name === "chevronUp" && <Path d="M6 15l6-6 6 6" {...p} />}
      {name === "check" && <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />}
      {name === "scooter" && (<><Circle cx={6} cy={17} r={3} {...p} /><Circle cx={18} cy={17} r={3} {...p} /><Path d="M6 17l3-8h5l1 4h3" {...p} /><Path d="M12 5h3l1 4" {...p} /><Path d="M9 9H5" {...p} /></>)}
      {name === "cut" && (<><Path d="M4 20l12-12 3 3-9 9z" {...p} /><Path d="M14 10l3-3 2 2" {...p} /><Path d="M4 20l1-3" {...p} /></>)}
      {name === "edit" && (<><Path d="M4 20h4l10-10-4-4L4 16z" {...p} /><Path d="M13 7l4 4" {...p} /></>)}
      {name === "trash" && (<><Path d="M4 7h16" {...p} /><Path d="M9 7V4h6v3" {...p} /><Path d="M6 7l1 13h10l1-13" {...p} /><Path d="M10 11v6" {...p} /><Path d="M14 11v6" {...p} /></>)}
      {name === "logout" && (<><Path d="M15 4h4v16h-4" {...p} /><Path d="M10 8l-4 4 4 4" {...p} /><Path d="M6 12h10" {...p} /></>)}
    </Svg>
  );
}
