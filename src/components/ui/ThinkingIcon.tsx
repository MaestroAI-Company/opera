import LottieView from "lottie-react-native";

const loadingAnimation = require("../../../assets/animations/loading.json");
const size = { width: 35, height: 35 };

export default function ThinkingIcon() {
  return <LottieView source={loadingAnimation} autoPlay loop style={size} />;
}
