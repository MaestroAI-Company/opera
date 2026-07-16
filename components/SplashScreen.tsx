import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import LottieView from "lottie-react-native";

const animation = require("../assets/animations/Splashscreen.json");

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const animationRef = useRef<LottieView>(null);

  return (
    <View style={styles.container}>
      <LottieView
        ref={animationRef}
        source={animation}
        autoPlay
        loop={false}
        resizeMode="cover"
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
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FDF8F1",
  },
  animation: {
    width: "100%",
    height: "100%",
  },
});
