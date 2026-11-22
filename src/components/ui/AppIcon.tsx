import type { ComponentType } from "react";
import { Image, ImageStyle, ImageSourcePropType, StyleProp, StyleSheet } from "react-native";
import type { SvgProps } from "react-native-svg";

export type IconSource = ComponentType<SvgProps> | ImageSourcePropType;

type AppIconProps = {
  source: IconSource;
  size?: number;
  tintColor?: string;
  resizeMode?: "contain" | "cover" | "stretch" | "center";
  style?: StyleProp<ImageStyle>;
};

//render svg component or raster png uniformly
export default function AppIcon({
  source,
  size,
  tintColor,
  resizeMode,
  style,
}: AppIconProps) {
  //handle commonjs {default: component} from require()
  const resolved =
    typeof source === "object" && source !== null && "default" in source
      ? (source as { default: IconSource }).default
      : source;

  if (typeof resolved === "function") {
    const SvgIcon = resolved as ComponentType<SvgProps>;
    const flat = style ? (StyleSheet.flatten(style) as ImageStyle | undefined) : undefined;
    const resolvedTint = tintColor ?? (flat?.tintColor as string | undefined);
    const width = size ?? (flat?.width as SvgProps["width"]);
    const height = size ?? (flat?.height as SvgProps["height"]);

    //strip image-only keys before forwarding style to svg
    const svgStyle = flat
      ? (({ tintColor: _t, resizeMode: _r, width: _w, height: _h, ...rest }) => rest)(flat)
      : undefined;

    return (
      <SvgIcon
        width={width}
        height={height}
        color={resolvedTint ?? "#000000"}
        style={svgStyle}
      />
    );
  }

  return (
    <Image
      source={resolved as ImageSourcePropType}
      style={[size != null ? { width: size, height: size } : undefined, style]}
      tintColor={tintColor}
      resizeMode={resizeMode}
    />
  );
}
