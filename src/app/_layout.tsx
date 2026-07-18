import { Buffer } from "buffer";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import SplashScreenComponent from "../../components/SplashScreen";
import TauriTitleBar from "../../components/TauriTitleBar";

global.Buffer = global.Buffer || Buffer;

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const isWebBrowser = Platform.OS === "web" && typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
  const [showLottie, setShowLottie] = useState(!isWebBrowser);
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
      <TauriTitleBar />
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </>
  );
}
