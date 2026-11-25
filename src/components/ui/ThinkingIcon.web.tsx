import { useMemo } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useColors } from "../../hooks/useTheme";

const loadingAnimation = require("../../../assets/animations/loading.json");

type Shape = { ty: string; it?: Shape[]; c?: { k: number[] } };

//lottie colors are 0-1 rgba
const toLottieColor = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(1);

const paint = (shapes: Shape[], color: number[]) => {
  for (const shape of shapes) {
    if (shape.ty === "gr" && shape.it) paint(shape.it, color);
    if (shape.ty === "fl" && shape.c) shape.c.k = color;
  }
};

export default function ThinkingIcon({ size = 35 }: { size?: number }) {
  const { primary } = useColors();
  //tinted copy so the maestro accent reaches the pixels
  const data = useMemo(() => {
    const copy = JSON.parse(JSON.stringify(loadingAnimation));
    const color = toLottieColor(primary);
    for (const layer of copy.layers) if (layer.shapes) paint(layer.shapes, color);
    return copy;
  }, [primary]);
  return (
    <DotLottieReact
      data={data}
      autoplay
      loop
      layout={{ fit: "contain" }}
      style={{ width: size, height: size }}
    />
  );
}
