import LottieView from "lottie-react-native";
import { Colors } from "../../../constants/theme";

const loadingAnimation = require("../../../assets/animations/loading.json");
const searchingAnimation = require("../../../assets/animations/searching.json");

//animation is built from pixel_0..pixel_33 shape layers, all one fill color
const incognitoColorFilters = Array.from({ length: 37 }, (_, i) => ({
  keypath: `pixel_${i}`,
  color: Colors.incognito,
}));

//searching swaps the butterfly for a pixel circle with the same pulse
export default function ThinkingIcon({ incognito, searching, size = 35 }: { incognito?: boolean; searching?: boolean; size?: number }) {
  return (
    <LottieView
      source={searching ? searchingAnimation : loadingAnimation}
      autoPlay
      loop
      renderMode="HARDWARE"
      style={{ width: size, height: size }}
      colorFilters={incognito ? incognitoColorFilters : undefined}
    />
  );
}
