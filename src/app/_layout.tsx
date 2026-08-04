import "react-native-get-random-values";
import { Buffer } from "buffer";
import * as Device from "expo-device";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import SplashScreenComponent from "../components/ui/SplashScreen";
import TauriTitleBar from "../components/features/TauriTitleBar";

import * as WebBrowser from "expo-web-browser";

global.Buffer = global.Buffer || Buffer;

WebBrowser.maybeCompleteAuthSession();
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [showLottie, setShowLottie] = useState(Platform.OS !== "web");
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

  useEffect(() => {
    async function lockMobileOrientation() {
      //lock orientation on phone only
      if (Platform.OS !== "web") {
        const deviceType = await Device.getDeviceTypeAsync();
        if (deviceType === Device.DeviceType.PHONE) {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP
          );
        }
      }
    }
    lockMobileOrientation();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      const handleContextMenu = (e: Event) => e.preventDefault();
      document.addEventListener("contextmenu", handleContextMenu);
      return () => document.removeEventListener("contextmenu", handleContextMenu);
    }
  }, []);

  if (showLottie || (!fontsLoaded && !fontError)) {
    return (
      <SplashScreenComponent
        onFinish={() => setShowLottie(false)}
      />
    );
  }

  return (
    <KeyboardProvider>
      <TauriTitleBar />
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </KeyboardProvider>
  );
}
