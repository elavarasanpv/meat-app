import Svg, { Circle, Ellipse, Path } from "react-native-svg";

/**
 * FreshCut line doodles: simple outline drawings of what we sell, used in
 * place of generic sparkles — header background, section titles, labels.
 * All on a 24 grid, stroke only, so they tint to any colour.
 */
export type DoodleName = "drumstick" | "leaf" | "chilli" | "egg" | "cleaver" | "basket" | "bowl";

export function Doodle({ name, size = 20, color, strokeWidth = 1.8, opacity = 1 }: { name: DoodleName; size?: number; color: string; strokeWidth?: number; opacity?: number }) {
  const p = { stroke: color, strokeWidth, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
      {name === "drumstick" && (
        <>
          {/* plump meaty end, tilted */}
          <Ellipse cx={14.8} cy={9.2} rx={6.4} ry={5} transform="rotate(-45 14.8 9.2)" {...p} />
          {/* bone */}
          <Path d="M10.6 13.4 7 17" {...p} />
          {/* double knuckle at the bone's end */}
          <Circle cx={5.4} cy={16.9} r={1.7} {...p} />
          <Circle cx={7.1} cy={18.6} r={1.7} {...p} />
          {/* highlight */}
          <Path d="M14.6 5.6c1.6.2 3 1.5 3.4 3.1" {...p} opacity={0.55} />
        </>
      )}
      {name === "leaf" && (
        <>
          <Path d="M4 20C4 11 10 5 20 4c-.5 9.5-6.5 16-16 16z" {...p} />
          <Path d="M4 20 14.5 9.5" {...p} />
          <Path d="M8.5 15.5 8 12.5M11.5 12.5l3 .5" {...p} opacity={0.7} />
        </>
      )}
      {name === "chilli" && (
        <>
          <Path d="M17.5 6.5C14 7 12 10 10 13.5S5.5 19.5 3 20.5c4 .8 9-1 12-4.5 2.7-3.1 3.6-6.5 2.5-9.5z" {...p} />
          <Path d="M17.5 6.5c.4-1.2 1.4-2.2 2.8-2.6" {...p} />
          <Path d="M16.2 6.9c.6.6 1.4.8 2.2.6" {...p} />
        </>
      )}
      {name === "egg" && (
        <>
          <Path d="M12 3c3.6 0 6.5 5.4 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8.4 8.4 3 12 3z" {...p} />
          <Path d="M9 12.5c0-2 1-4.2 2.4-5.3" {...p} opacity={0.6} />
        </>
      )}
      {name === "cleaver" && (
        <>
          <Path d="M3.5 5.5h12l1 8.5H5a1.5 1.5 0 0 1-1.5-1.5z" {...p} />
          <Path d="M16.3 9.5h2.2l2.5 1.6v1.3l-2.5 1.6h-2" {...p} />
          <Circle cx={6.5} cy={8} r={0.9} {...p} />
          <Path d="M5.5 11.5h8.5" {...p} opacity={0.6} />
        </>
      )}
      {name === "basket" && (
        <>
          <Path d="M3 10h18l-2 9a1.5 1.5 0 0 1-1.5 1.2h-11A1.5 1.5 0 0 1 5 19z" {...p} />
          <Path d="M7.5 10 11 4M16.5 10 13 4" {...p} />
          <Path d="M9 13.5v4M12 13.5v4M15 13.5v4" {...p} opacity={0.7} />
        </>
      )}
      {name === "bowl" && (
        <>
          <Path d="M3 12h18a9 6.5 0 0 1-18 0z" {...p} />
          <Ellipse cx={12} cy={12} rx={9} ry={1.6} {...p} opacity={0.6} />
          <Path d="M9 9.5c.6-1.4 2-2.3 3.5-2.3M14.5 9.2c.4-.8 1.2-1.3 2-1.3" {...p} />
          <Path d="M9.5 21h5" {...p} />
        </>
      )}
    </Svg>
  );
}
