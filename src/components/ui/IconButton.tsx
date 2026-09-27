import { useEffect, useRef } from "react";
import { Image, ImageSourcePropType, Pressable, StyleProp, View, ViewStyle } from "react-native";
import { Radius } from "../../../constants/theme";
import { useIconLabel } from "./IconLabel";

export type IconButtonProps = {
  icon: ImageSourcePropType;
  label?: string;
  name?: string;
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
  label,
  name,
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
  const buttonRef = useRef<View>(null);
  const isHoveredRef = useRef(false);
  const { showLabel, hideLabel } = useIconLabel();
  const iconLabelText = label ?? name;

  //dismiss label when button unmounts
  useEffect(() => {
    return () => {
      hideLabel();
    };
  }, [hideLabel]);

  const handleHoverIn = () => {
    isHoveredRef.current = true;
    if (iconLabelText && !disabled) {
      showLabel(iconLabelText, buttonRef);
    }
  };

  const handleHoverOut = () => {
    isHoveredRef.current = false;
    if (iconLabelText) {
      hideLabel();
    }
  };

  const handlePressIn = () => {
    if (iconLabelText && !disabled) {
      showLabel(iconLabelText, buttonRef);
    }
  };

  const handlePressOut = () => {
    //keep label on web hover
    if (iconLabelText && !isHoveredRef.current) {
      hideLabel();
    }
  };

  return (
    <Pressable
      ref={buttonRef}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
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
