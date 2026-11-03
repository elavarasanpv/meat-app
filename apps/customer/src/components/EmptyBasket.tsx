import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";

const C = {
  primary: "#E4461F",
  dark: "#B8361A",
  soft: "#F7A65E",
  tint: "#FDE6DF",
  cream: "#FFF6EE",
  ground: "#F3ECE6",
  ink: "#1C1715",
};

/**
 * Empty-cart illustration: a flat woven basket in FreshCut orange with an
 * empty cream inside and a "0" tag. Drawn as vector so it's sharp at any size.
 */
export function EmptyBasket({ size = 220 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.86} viewBox="0 0 240 206" accessible={false}>
      {/* backdrop */}
      <Circle cx={120} cy={104} r={92} fill={C.tint} />
      <Ellipse cx={120} cy={186} rx={78} ry={9} fill={C.ground} />

      {/* sparkles */}
      <Path d="M52 58l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={C.soft} />
      <Path d="M188 44l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={C.soft} />
      <Circle cx={196} cy={86} r={3} fill={C.soft} />
      <Circle cx={40} cy={102} r={2.5} fill={C.soft} />

      {/* handle */}
      <Path d="M62 106C62 22 178 22 178 106" stroke={C.dark} strokeWidth={13} strokeLinecap="round" fill="none" />
      <Path d="M62 106C62 22 178 22 178 106" stroke={C.primary} strokeWidth={7} strokeLinecap="round" fill="none" />

      {/* body */}
      <Path d="M42 108h156l-15 66a10 10 0 0 1-9.8 8H66.8a10 10 0 0 1-9.8-8z" fill={C.primary} />
      {/* weave: horizontal bands */}
      <G opacity={0.55}>
        <Path d="M50 130h140" stroke={C.soft} strokeWidth={6} strokeLinecap="round" />
        <Path d="M54 150h132" stroke={C.soft} strokeWidth={6} strokeLinecap="round" />
        <Path d="M58 168h124" stroke={C.soft} strokeWidth={6} strokeLinecap="round" />
      </G>
      {/* weave: slats */}
      <G stroke={C.dark} strokeWidth={2.5} strokeLinecap="round" opacity={0.45}>
        <Path d="M72 118l5 60M98 118l2 62M120 118v62M142 118l-2 62M168 118l-5 60" />
      </G>

      {/* rim seen from above, with the empty inside showing */}
      <Ellipse cx={120} cy={108} rx={82} ry={17} fill={C.dark} />
      <Ellipse cx={120} cy={106} rx={78} ry={14} fill={C.primary} />
      <Ellipse cx={120} cy={107} rx={68} ry={10} fill={C.cream} />
      <Ellipse cx={120} cy={110} rx={56} ry={5} fill={C.tint} />

      {/* "0" tag */}
      <Path d="M178 112c4 4 6 8 6 12" stroke={C.ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <G transform="rotate(8 192 140)">
        <Rect x={174} y={122} width={34} height={38} rx={7} fill="#FFFFFF" stroke={C.ink} strokeWidth={2} />
        <Circle cx={191} cy={129} r={2.2} fill={C.ink} />
        <SvgText x={191} y={153} fontSize={19} fontWeight="800" fill={C.ink} textAnchor="middle">
          0
        </SvgText>
      </G>
    </Svg>
  );
}
