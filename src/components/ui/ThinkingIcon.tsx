import LottieView from "lottie-react-native";
import { Colors } from "../../../constants/theme";

const loadingAnimation = require("../../../assets/animations/loading.json");
const size = { width: 35, height: 35 };

//animation is built from pixel_0..pixel_33 shape layers, all one fill color
const incognitoColorFilters = Array.from({ length: 34 }, (_, i) => ({
  keypath: `pixel_${i}`,
  color: Colors.incognito,
}));

export default function ThinkingIcon({ incognito }: { incognito?: boolean }) {
  return (
    <LottieView
      source={loadingAnimation}
      autoPlay
      loop
      style={size}
      colorFilters={incognito ? incognitoColorFilters : undefined}
    />
  );
}
