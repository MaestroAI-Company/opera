const animation = require("../../../assets/animations/Splashscreen.json");

//cream wipe that reveals the app
const WIPE_LAYER = 3;

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

//wipe ends on the app background, no flash in dark mode
export function splashAnimation(background: string) {
  const data = JSON.parse(JSON.stringify(animation));
  const wipe = data.layers.find((layer: { ind: number }) => layer.ind === WIPE_LAYER);
  if (wipe) paint(wipe.shapes, toLottieColor(background));
  return data;
}
