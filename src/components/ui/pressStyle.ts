import { PressableStateCallbackType, StyleProp, StyleSheet, ViewStyle } from "react-native";
import { ThemeColors } from "../../../constants/theme";
import { getThemedStyles } from "../../hooks/useTheme";

//shared looks while pressed or hovered
const makeLooks = (Colors: ThemeColors) => StyleSheet.create({
  surface: { backgroundColor: Colors.surfacePressed },
  primary: { backgroundColor: Colors.primaryBright },
  subtle: { backgroundColor: Colors.overlaySubtle },
  fade: { opacity: 0.6 },
  fadeLight: { opacity: 0.8 },
});

export type PressLook = keyof ReturnType<typeof makeLooks>;

//web and desktop add hovered to the state
type PressState = PressableStateCallbackType & { hovered?: boolean };

//pressable style, base plus a look while pressed or hovered
export function pressStyle(base: StyleProp<ViewStyle>, active: PressLook | StyleProp<ViewStyle>) {
  return ({ pressed, hovered }: PressState): StyleProp<ViewStyle> => {
    if (!pressed && !hovered) return base;
    //read at press time so it follows the theme
    const look = typeof active === "string" && active !== "" ? getThemedStyles(makeLooks)[active] : active;
    return [base, look];
  };
}
