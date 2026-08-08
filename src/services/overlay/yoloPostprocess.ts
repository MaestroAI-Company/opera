//yolo head decode + nms (model space -> capture pixels)
const TARGET = 640;

export type YoloDetection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  confidence: number;
};

export function letterboxParams(srcW: number, srcH: number, target = TARGET) {
  const scale = Math.min(target / srcW, target / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = (target - newW) / 2;
  const padY = (target - newH) / 2;
  return { scale, padX, padY };
}

function iouRaw(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): number {
  const ix1 = ax1 > bx1 ? ax1 : bx1;
  const iy1 = ay1 > by1 ? ay1 : by1;
  const ix2 = ax2 < bx2 ? ax2 : bx2;
  const iy2 = ay2 < by2 ? ay2 : by2;
  const iw = ix2 - ix1;
  const ih = iy2 - iy1;
  const inter = iw > 0 && ih > 0 ? iw * ih : 0;
  const areaA = (ax2 - ax1) * (ay2 - ay1);
  const areaB = (bx2 - bx1) * (by2 - by1);
  return inter / (areaA + areaB - inter + 1e-9);
}

//decode the raw head output into detections in capture pixels
export function decodeYoloOutput(
  data: ArrayBuffer | Float32Array,
  sizes: number[],
  srcW: number,
  srcH: number,
  classes: readonly string[],
  confThreshold = 0.25,
  iouThreshold = 0.45,
  target = TARGET
): YoloDetection[] {
  const { scale, padX, padY } = letterboxParams(srcW, srcH, target);
  const out = data instanceof Float32Array ? data : new Float32Array(data);
  const numChannels = classes.length + 4;

  //support [1, anchors, 4+nc] and [1, 4+nc, anchors]
  let numAnchors = 0;
  let candidateMajor = true;
  if (sizes.length >= 3) {
    if (sizes[2] === numChannels) {
      numAnchors = sizes[1];
      candidateMajor = true;
    } else if (sizes[1] === numChannels) {
      numAnchors = sizes[2];
      candidateMajor = false;
    }
  }
  if (numAnchors === 0) {
    //fallback: assume (1, anchors, 4+nc)
    numAnchors = Math.floor(out.length / numChannels);
    candidateMajor = true;
  }

  //parallel typed arrays sized for the worst case, filled up to `count`
  const bx1 = new Float32Array(numAnchors);
  const by1 = new Float32Array(numAnchors);
  const bx2 = new Float32Array(numAnchors);
  const by2 = new Float32Array(numAnchors);
  const bcls = new Int32Array(numAnchors);
  const bconf = new Float32Array(numAnchors);
  let count = 0;

  const numClasses = classes.length;

  for (let i = 0; i < numAnchors; i++) {
    const base = candidateMajor ? i * numChannels : i;
    const stride = candidateMajor ? 1 : numAnchors;

    let bestCls = 0;
    let bestScore = out[base + 4 * stride] as number;
    for (let c = 1; c < numClasses; c++) {
      const score = out[base + (c + 4) * stride] as number;
      if (score > bestScore) {
        bestScore = score;
        bestCls = c;
      }
    }
    //filter early so we skip cx/cy/w/h + de-letterbox for rejects
    if (bestScore < confThreshold) continue;

    let cx = out[base] as number;
    let cy = out[base + stride] as number;
    let w = out[base + 2 * stride] as number;
    let h = out[base + 3 * stride] as number;

    //some exports give normalized coords (0..1) instead of pixels
    const halfW = w * 0.5;
    const halfH = h * 0.5;
    if (cx + halfW <= 1.5 && cy + halfH <= 1.5) {
      cx *= target; cy *= target; w *= target; h *= target;
    }
    const hw = w * 0.5;
    const hh = h * 0.5;

    //de-letterbox back to capture pixels
    bx1[count] = (cx - hw - padX) / scale;
    by1[count] = (cy - hh - padY) / scale;
    bx2[count] = (cx + hw - padX) / scale;
    by2[count] = (cy + hh - padY) / scale;
    bcls[count] = bestCls;
    bconf[count] = bestScore;
    count++;
  }

  //index array sorted by confidence desc, used to walk per class
  const order = new Int32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  //simple insertion for very small counts, otherwise built-in sort via Array wrapper
  const orderArr = Array.from(order);
  orderArr.sort((a, b) => bconf[b] - bconf[a]);

  const suppressed = new Uint8Array(count);
  const kept: YoloDetection[] = [];

  for (let oi = 0; oi < orderArr.length; oi++) {
    const i = orderArr[oi];
    if (suppressed[i]) continue;
    const ci = bcls[i];
    const ax1 = bx1[i], ay1 = by1[i], ax2 = bx2[i], ay2 = by2[i];
    kept.push({
      x1: Math.max(0, Math.min(srcW, ax1)),
      y1: Math.max(0, Math.min(srcH, ay1)),
      x2: Math.max(0, Math.min(srcW, ax2)),
      y2: Math.max(0, Math.min(srcH, ay2)),
      label: classes[ci],
      confidence: bconf[i],
    });
    //suppress lower-confidence overlaps of the same class
    for (let oj = oi + 1; oj < orderArr.length; oj++) {
      const j = orderArr[oj];
      if (suppressed[j] || bcls[j] !== ci) continue;
      if (iouRaw(ax1, ay1, ax2, ay2, bx1[j], by1[j], bx2[j], by2[j]) > iouThreshold) {
        suppressed[j] = 1;
      }
    }
  }
  return kept;
}

//nearest detected zone to a point, within maxDist (capture pixels)
export function snapToDetection(
  detections: YoloDetection[],
  x: number,
  y: number,
  maxDist = 48
): YoloDetection | null {
  let best: YoloDetection | null = null;
  let bestDist = maxDist;
  for (const d of detections) {
    const cx = (d.x1 + d.x2) / 2;
    const cy = (d.y1 + d.y2) / 2;
    const dist = Math.hypot(cx - x, cy - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}
