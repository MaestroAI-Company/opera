export type Rect = { x1: number; y1: number; x2: number; y2: number };

//coverage that counts as picked
const ENCLOSED_MIN = 0.45;
//scribble overlap picks element
const MAGNET_MIN = 0.55;

const areaOf = (rect: Rect) => (rect.x2 - rect.x1) * (rect.y2 - rect.y1);

export const union = (a: Rect, b: Rect): Rect => ({
  x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2),
});

function shared(a: Rect, b: Rect): number {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return width > 0 && height > 0 ? width * height : 0;
}

//covered elements grow the region
export function pickRegion(rects: Rect[], bounds: Rect): Rect | null {
  let region: Rect | null = null;
  for (const rect of rects) {
    //grazed neighbour not the target
    if (shared(rect, bounds) / areaOf(rect) < ENCLOSED_MIN) continue;
    region = union(region ?? bounds, rect);
  }
  if (region) return region;

  //scribble inside one element picks it
  const area = areaOf(bounds);
  if (area <= 0) return null;
  let best: Rect | null = null;
  let bestScore = MAGNET_MIN;
  for (const rect of rects) {
    const score = shared(rect, bounds) / area;
    if (score > bestScore) {
      bestScore = score;
      best = rect;
    }
  }
  return best;
}
