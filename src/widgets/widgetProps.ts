import {
  DarkColors,
  FontSizes,
  LightColors,
  Radius,
  withAccent,
  type ThemeColors,
} from "../../constants/theme";

//props the app sends to widgets

export const NEW_DISCUSSION_URL = "opera://new";
//new chat then camera
export const CAMERA_URL = "opera://camera";

export type WidgetPalette = {
  background: string;
  ring: string;
  text: string;
  primary: string;
  primaryRing: string;
  onPrimary: string;
};

export type QuickActionsProps = {
  light: WidgetPalette;
  dark: WidgetPalette;
  //widget code cannot import tokens
  metrics: { windowRadius: number; radius: number; outline: number; fontSize: number };
  wide: boolean;
  newLabel: string;
  cameraLabel: string;
  newUrl: string;
  cameraUrl: string;
  //empty until the app copies files
  addIcon: string;
  cameraIcon: string;
};

export type ButterflyProps = {
  accent: string;
  image: string;
  radius: number;
};

export const toPalette =(c: ThemeColors): WidgetPalette => ({
  background: c.background,
  ring: c.surfacePressed,
  text: c.textPrimary,
  primary: c.primary,
  primaryRing: c.primaryBright,
  onPrimary: c.textOnPrimary,
});

export function quickActionsProps(
  accent: string,
  labels: { newLabel: string; cameraLabel: string },
  icons: { addIcon: string; cameraIcon: string },
  wide: boolean
): QuickActionsProps {
  return {
    light: toPalette(withAccent(LightColors, accent)),
    dark: toPalette(withAccent(DarkColors, accent)),
    metrics: {
      windowRadius: Radius.window,
      radius: Radius.xxl,
      outline: 2,
      fontSize: FontSizes.label,
    },
    wide,
    ...labels,
    newUrl: NEW_DISCUSSION_URL,
    cameraUrl: CAMERA_URL,
    ...icons,
  };
}

export const DEFAULT_QUICK_ACTIONS = quickActionsProps(
  LightColors.primary,
  { newLabel: "New discussion", cameraLabel: "Camera" },
  { addIcon: "", cameraIcon: "" },
  false
);

export const DEFAULT_BUTTERFLY: ButterflyProps = {
  accent: LightColors.primary,
  image: "",
  radius: Radius.window,
};
