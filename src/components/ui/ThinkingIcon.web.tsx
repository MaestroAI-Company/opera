import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const loadingAnimation = require("../../../assets/animations/loading.json");
const size = { width: 35, height: 35 };

export default function ThinkingIcon() {
  return (
    <DotLottieReact
      data={loadingAnimation}
      autoplay
      loop
      layout={{ fit: "contain" }}
      style={size}
    />
  );
}
