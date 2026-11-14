import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const loadingAnimation = require("../../../assets/animations/loading.json");
const searchingAnimation = require("../../../assets/animations/searching.json");

//searching swaps the butterfly for a pixel circle with the same pulse
export default function ThinkingIcon({ searching, size = 35 }: { searching?: boolean; size?: number }) {
  return (
    <DotLottieReact
      data={searching ? searchingAnimation : loadingAnimation}
      autoplay
      loop
      layout={{ fit: "contain" }}
      style={{ width: size, height: size }}
    />
  );
}
