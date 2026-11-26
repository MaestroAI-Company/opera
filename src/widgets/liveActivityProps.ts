import { DarkColors, FontSizes, LightColors, Radius, withAccent } from "../../constants/theme";
import { toPalette, type WidgetPalette } from "./widgetProps";

//props the app sends to live activities

//button ids on the call card
export const CALL_HANGUP = "hangup";
export const CALL_MUTE = "mute";

type ActivityStyle = {
  light: WidgetPalette;
  dark: WidgetPalette;
  //activity code cannot import tokens
  metrics: { radius: number; outline: number; fontSize: number; fontSizeSm: number };
};

export type DownloadActivityProps = ActivityStyle & {
  title: string;
  progress: number;
  detail: string;
};

export type CallActivityProps = ActivityStyle & {
  title: string;
  text: string;
  startedAt: number;
  //accent behind the butterfly
  accent: string;
  //empty until the file is copied
  image: string;
  hangUpLabel: string;
  muteLabel: string;
};

export function activityStyle(accent: string): ActivityStyle {
  return {
    light: toPalette(withAccent(LightColors, accent)),
    dark: toPalette(withAccent(DarkColors, accent)),
    metrics: {
      radius: Radius.xxl,
      outline: 2,
      fontSize: FontSizes.label,
      fontSizeSm: FontSizes.labelSm,
    },
  };
}
