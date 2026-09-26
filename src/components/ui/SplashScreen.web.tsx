import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { DotLottie, DotLottieReact } from "@lottiefiles/dotlottie-react";
import { ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";

const animation = require("../../../assets/animations/Splashscreen.json");

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const styles = useThemedStyles(makeStyles);
  const dotLottieRef = useRef<DotLottie | null>(null);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const handleComplete = useCallback(() => {
    onFinishRef.current();
  }, []);

  const handleRef = useCallback(
    (dotLottie: DotLottie | null) => {
      if (dotLottieRef.current) {
        dotLottieRef.current.removeEventListener("complete", handleComplete);
      }
      dotLottieRef.current = dotLottie;
      if (dotLottie) {
        dotLottie.addEventListener("complete", handleComplete);
      }
    },
    [handleComplete]
  );

  useEffect(() => {
    return () => {
      if (dotLottieRef.current) {
        dotLottieRef.current.removeEventListener("complete", handleComplete);
      }
    };
  }, [handleComplete]);

  return (
    <View style={styles.container}>
      <DotLottieReact
        data={animation}
        autoplay
        loop={false}
        layout={{ fit: "cover", align: [0.5, 0.5] }}
        dotLottieRefCallback={handleRef}
        style={styles.animation}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  animation: {
    width: "100%",
    height: "100%",
  },
});
