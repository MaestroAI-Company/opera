import { useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import LottieView from "lottie-react-native";
import { ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { splashAnimation } from "./splashAnimation";

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const animationRef = useRef<LottieView>(null);
  const animation = useMemo(() => splashAnimation(Colors.background), [Colors.background]);

  const isDesktop = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || window.innerWidth > 1024);

  return (
    <View style={styles.container}>
      <LottieView
        ref={animationRef}
        source={animation}
        autoPlay
        loop={false}
        resizeMode={isDesktop ? "contain" : "cover"}
        style={styles.animation}
        onAnimationFinish={(isCancelled) => {
          if (!isCancelled) {
            onFinish();
          }
        }}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  animation: {
    width: "100%",
    height: "100%",
  },
});
