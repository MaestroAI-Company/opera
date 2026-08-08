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

function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter + 1e-9);
}

//decode the raw head output into detections in capture pixels
export function decodeYoloOutput(
  data: ArrayBuffer | Float32Array,
  sizes: number[],
  srcW: number,
  srcH: number,
  classes: readonly string[],
  confThreshold = 0.1,
  iouThreshold = 0.1,
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

  const boxes: { x1: number; y1: number; x2: number; y2: number; cls: number; conf: number }[] = [];

  for (let i = 0; i < numAnchors; i++) {
    const base = candidateMajor ? i * numChannels : i;
    const stride = candidateMajor ? 1 : numAnchors;
    let cx = out[base] as number;
    let cy = out[base + stride] as number;
    let w = out[base + 2 * stride] as number;
    let h = out[base + 3 * stride] as number;

    //some exports give normalized coords (0..1) instead of pixels
    if (Math.max(cx + w / 2, cy + h / 2) <= 1.5) {
      cx *= target;
      cy *= target;
      w *= target;
      h *= target;
    }

    let bestCls = 0;
    let bestScore = 0;
    for (let c = 0; c < classes.length; c++) {
      const score = out[base + (c + 4) * stride] as number;
      if (score > bestScore) {
        bestScore = score;
        bestCls = c;
      }
    }
    if (bestScore < confThreshold) continue;

    //de-letterbox back to capture pixels
    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale;
    const y2 = (cy + h / 2 - padY) / scale;
    boxes.push({ x1, y1, x2, y2, cls: bestCls, conf: bestScore });
  }

  //per-class greedy nms
  const kept: YoloDetection[] = [];
  const byClass = new Map<number, typeof boxes>();
  for (const b of boxes) {
    const list = byClass.get(b.cls);
    if (list) list.push(b);
    else byClass.set(b.cls, [b]);
  }
  for (const list of byClass.values()) {
    list.sort((a, b) => b.conf - a.conf);
    while (list.length > 0) {
      const best = list.shift()!;
      const rect = [best.x1, best.y1, best.x2, best.y2];
      kept.push({
        x1: Math.max(0, Math.min(srcW, best.x1)),
        y1: Math.max(0, Math.min(srcH, best.y1)),
        x2: Math.max(0, Math.min(srcW, best.x2)),
        y2: Math.max(0, Math.min(srcH, best.y2)),
        label: classes[best.cls],
        confidence: best.conf,
      });
      for (let i = list.length - 1; i >= 0; i--) {
        const other = [list[i].x1, list[i].y1, list[i].x2, list[i].y2];
        if (iou(rect, other) > iouThreshold) list.splice(i, 1);
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
