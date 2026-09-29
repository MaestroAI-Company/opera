import Animated, {
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useColors } from "../../hooks/useTheme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const GRID = 75;
//on screen size, the viewbox scales one cell per unit
const SIZE = 250;
//small steps keep curves unbroken
const STEP = 0.3 / GRID;
const SAMPLES = Math.ceil((Math.PI * 2) / STEP);
//metaball merge, squared reach in cells
const REACH = 9;
//merge threshold from soft to crisp
const MERGE_SOFT = 3.2;
const MERGE_CRISP = 6.0;
const TREMBLE_MAX = 1.2;
const TREMBLE_FPS = 24;
const SPEED = 2;
//speed swings by this share, over a slow cycle
const PACE = 0.35;
const PACE_RATE = 0.8;
//grow in seconds when the page opens
const INTRO = 1.2;

//seam like loops wrapped around the sphere
const CURVES = [
  { waves: 2, spinX: 0.31, spinY: 0.47, morph: 0.7, drift: 0.4, phase: 0 },
  { waves: 3, spinX: -0.23, spinY: -0.38, morph: 0.5, drift: -0.3, phase: 2 },
  { waves: 2, spinX: 0.19, spinY: -0.29, morph: 0.6, drift: 0.35, phase: 4 },
];

//frame independent work done once
const COS_S = Array.from({ length: SAMPLES }, (_, k) => Math.cos(k * STEP));
const SIN_S = Array.from({ length: SAMPLES }, (_, k) => Math.sin(k * STEP));
//flat dx, dy, weight triplets
const KERNEL: number[] = [];
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    const r2 = dx * dx + dy * dy;
    if (r2 < REACH) KERNEL.push(dx, dy, 1 - r2 / REACH);
  }
}
const CELL_PATHS = Array.from(
  { length: GRID * GRID },
  (_, i) =>
    `M${i % GRID} ${Math.floor(i / GRID)}h1v1h-1z`,
);

//lit cells as one svg path, built on the ui thread
const buildPath = (t: number, time: number, sharpness: number) => {
  "worklet";
  const merge = MERGE_SOFT + (MERGE_CRISP - MERGE_SOFT) * sharpness;
  const tremble = TREMBLE_MAX * (1 - sharpness);
  //ease out radius, grows pixel by pixel from the center
  const grow = 1 - Math.pow(1 - Math.min(1, time / INTRO), 3);
  const seen = new Uint8Array(GRID * GRID);
  const lit = new Uint8Array(GRID * GRID);
  const field = new Float32Array(GRID * GRID);
  for (const c of CURVES) {
    //loop swings from a ring to deep lobes
    const amp = 0.525 + 0.275 * Math.sin(t * c.morph + c.phase);
    const cosX = Math.cos(t * c.spinX + c.phase);
    const sinX = Math.sin(t * c.spinX + c.phase);
    const cosY = Math.cos(t * c.spinY);
    const sinY = Math.sin(t * c.spinY);
    const offset = t * c.drift + c.phase;
    let hidden = 0;
    for (let k = 0; k < SAMPLES; k++) {
      const lat = amp * Math.sin(c.waves * k * STEP + offset);
      const r = Math.cos(lat);
      const x = r * COS_S[k];
      const y = Math.sin(lat);
      const z = r * SIN_S[k];
      //tumble around x then y
      const y1 = y * cosX - z * sinX;
      const z1 = y * sinX + z * cosX;
      const x2 = x * cosY + z1 * sinY;
      const z2 = z1 * cosY - x * sinY;
      const col = Math.floor(((x2 * grow + 1) / 2) * GRID);
      const row = Math.floor(((y1 * grow + 1) / 2) * GRID);
      const i = row * GRID + col;
      if (col < 0 || col >= GRID || row < 0 || row >= GRID || seen[i]) continue;
      seen[i] = 1;
      //back side drawn dotted for depth
      if (z2 < 0 && hidden++ % 2) continue;
      lit[i] = 1;
      //spread influence so close strokes pool together
      for (let j = 0; j < KERNEL.length; j += 3) {
        const x3 = col + KERNEL[j];
        const y3 = row + KERNEL[j + 1];
        if (x3 >= 0 && x3 < GRID && y3 >= 0 && y3 < GRID)
          field[y3 * GRID + x3] += KERNEL[j + 2];
      }
    }
  }
  let d = "";
  //tremble rate stays independent of speed
  const tick = Math.floor(time * TREMBLE_FPS);
  for (let i = 0; i < GRID * GRID; i++) {
    if (!lit[i]) {
      if (field[i] < merge - tremble) continue;
      //noisy threshold makes merged edges shiver
      const n = Math.sin(i * 12.9898 + tick * 78.233) * 43758.5453;
      if (field[i] < merge + tremble * (2 * (n - Math.floor(n)) - 1)) continue;
    }
    d += CELL_PATHS[i];
  }
  return d;
};

type PixelSphereProps = {
  speed?: number;
  sharpness?: number;
  color?: string;
};

//pixel loops tumbling around an empty sphere, pooling when close
export default function PixelSphere({
  speed = 1,
  sharpness = 0.5,
  color,
}: PixelSphereProps) {
  const Colors = useColors();
  //real seconds since mount, and the eased motion clock
  const time = useSharedValue(0);
  const t = useSharedValue(0);

  //accumulated, a re-render re-registers the callback and resets its own clock
  useFrameCallback((frame) => {
    const dt = (frame.timeSincePreviousFrame ?? 0) / 1000;
    time.value += dt;
    //so speed changes never jump, pace eases in and out
    t.value +=
      dt * SPEED * speed * (1 + PACE * Math.cos(time.value * PACE_RATE));
  });

  const animatedProps = useAnimatedProps(() => ({
    d: buildPath(t.value, time.value, sharpness),
  }));

  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${GRID} ${GRID}`}
      style={{ alignSelf: "center" }}
    >
      <AnimatedPath
        animatedProps={animatedProps}
        fill={color ?? Colors.primary}
      />
    </Svg>
  );
}
