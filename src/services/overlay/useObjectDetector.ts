import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  initExecutorch,
  isAvailable,
  ScalarType,
  useExecutorchModule,
} from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';
import { OverlayNative } from './OverlayNative';
import { decodeYoloOutput, YoloDetection } from './yoloPostprocess';

export type ObjectDetectorConfig = {
  modelSource: number;
  classes: readonly string[];
  targetSize?: number;
};

let executorchInitialized = false;

function ensureInit() {
  if (!executorchInitialized && Platform.OS === 'android') {
    executorchInitialized = true;
    initExecutorch({ resourceFetcher: ExpoResourceFetcher });
  }
}

//loads a yolo .pte and runs detection on the current screenshot
export function useObjectDetector(config: ObjectDetectorConfig) {
  ensureInit();
  const targetSize = config.targetSize ?? 640;
  const { isReady, isGenerating, error, downloadProgress, forward } =
    useExecutorchModule({ modelSource: config.modelSource });

  //keep latest forward behind a ref so detect stays stable
  const isReadyRef = useRef(isReady);
  const forwardRef = useRef(forward);
  useEffect(() => {
    isReadyRef.current = isReady;
    forwardRef.current = forward;
  }, [isReady, forward]);

  const detect = useCallback(async (): Promise<YoloDetection[]> => {
    if (!isAvailable || !isReadyRef.current || !OverlayNative.supported()) return [];
    const info = await OverlayNative.getScreenshotInfo();
    const tensor = await OverlayNative.getYoloInputTensor();
    if (!info || !tensor) return [];
    const outputs = await forwardRef.current([
      { dataPtr: tensor, sizes: [1, 3, targetSize, targetSize], scalarType: ScalarType.FLOAT },
    ]);
    const output = outputs[0];
    if (!output) return [];
    return decodeYoloOutput(
      output.dataPtr as ArrayBuffer | Float32Array,
      output.sizes as number[],
      info.width,
      info.height,
      config.classes,
      undefined,
      undefined,
      targetSize
    );
  }, [config.classes, targetSize]);

  return { isReady, isGenerating, error, downloadProgress, detect };
}
