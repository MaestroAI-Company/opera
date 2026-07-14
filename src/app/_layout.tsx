import { Buffer } from "buffer";
global.Buffer = global.Buffer || Buffer;

import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import SplashScreenComponent from "../../components/SplashScreen";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [showLottie, setShowLottie] = useState(true);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  if (showLottie) {
    return (
      <SplashScreenComponent
        onFinish={() => setShowLottie(false)}
      />
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </>
  );
}
