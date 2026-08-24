import { Image, ImageSourcePropType, Pressable, StyleProp, ViewStyle } from "react-native";
import { Radius } from "../../../constants/theme";

export type IconButtonProps = {
  icon: ImageSourcePropType;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  disabled?: boolean;
  size?: number;
  tintColor?: string;
  hitSlop?: number;
  //fixed touch target with a circular pressed/hover background, eg. chat toolbar buttons
  containerSize?: number;
  pressedColor?: string;
  style?: StyleProp<ViewStyle>;
};

export default function IconButton({
  icon,
  onPress,
  onLongPress,
  delayLongPress,
  disabled,
  size = 22,
  tintColor,
  hitSlop = 8,
  containerSize,
  pressedColor,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed, hovered }) => [
        containerSize != null && {
          width: containerSize,
          height: containerSize,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: Radius.huge,
        },
        pressedColor && (pressed || hovered) && !disabled && { backgroundColor: pressedColor },
        disabled && { opacity: 0.3 },
        style,
      ]}
    >
      <Image source={icon} style={{ width: size, height: size, tintColor }} />
    </Pressable>
  );
}
