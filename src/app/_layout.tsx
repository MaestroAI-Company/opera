import { Buffer } from "buffer";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import SplashScreenComponent from "../../components/SplashScreen";

global.Buffer = global.Buffer || Buffer;

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [showLottie, setShowLottie] = useState(true);
  const [fontsLoaded, fontError] = useFonts({
    Petrona: require("../../assets/fonts/Petrona-Medium.ttf"),
    Jakarta: require("../../assets/fonts/PlusJakartaSans-VariableFont_wght.ttf"),
    "IBMPlexMono-Medium": require("../../assets/fonts/IBMPlexMono-Medium.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (showLottie || (!fontsLoaded && !fontError)) {
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
