import { useMemo } from "react";
import LottieView from "lottie-react-native";
import { useColors } from "../../hooks/useTheme";

const loadingAnimation = require("../../../assets/animations/loading.json");
const searchingAnimation = require("../../../assets/animations/searching.json");

//animation is built from pixel_0..pixel_36 shape layers, all one fill color
//tinted with the live palette so the maestro accent reaches it
//searching swaps the butterfly for a pixel circle with the same pulse
export default function ThinkingIcon({ incognito, searching, size = 35 }: { incognito?: boolean; searching?: boolean; size?: number }) {
  const Colors = useColors();
  const color = incognito ? Colors.incognito : Colors.primary;
  const colorFilters = useMemo(
    () => Array.from({ length: 37 }, (_, i) => ({ keypath: `pixel_${i}`, color })),
    [color],
  );
  return (
    <LottieView
      source={searching ? searchingAnimation : loadingAnimation}
      autoPlay
      loop
      renderMode="HARDWARE"
      style={{ width: size, height: size }}
      colorFilters={colorFilters}
    />
  );
}
