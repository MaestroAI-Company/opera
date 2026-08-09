import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import LottieView from "lottie-react-native";
import { Colors } from "../../../constants/theme";

const animation = require("../../../assets/animations/Splashscreen.json");

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const animationRef = useRef<LottieView>(null);

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

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  animation: {
    width: "100%",
    height: "100%",
  },
});
