import "react-native-get-random-values";
import { Buffer } from "buffer";
import * as Device from "expo-device";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import SiteHead from "../components/SiteHead";
import SplashScreenComponent from "../components/ui/SplashScreen";
import TauriTitleBar from "../components/features/TauriTitleBar";
import { initTheme, useIsDark } from "../hooks/useTheme";
import { installCrashHandler } from "../services/logging/CrashReporter";
import { installLogger } from "../services/logging/Logger";
import { setupQuickActions } from "../services/quickActions/QuickActionsService";
import "../services/widgets/registerWidgets";

import * as WebBrowser from "expo-web-browser";

//crypto libs expect buffer global
if (!(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

WebBrowser.maybeCompleteAuthSession();
SplashScreen.preventAutoHideAsync();

//resolve the palette before the first paint
initTheme();

//bug reports carry console output
installLogger();

//crash reported on next launch
installCrashHandler();

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const screenLayout = ({ children }: { children: ReactNode }) => (
  <>
    <SiteHead />
    {children}
  </>
);

export default function RootLayout() {
  const isDark = useIsDark();
  const [showLottie, setShowLottie] = useState(Platform.OS !== "web" || isTauri);
  const [fontsLoaded, fontError] = useFonts({
    Petrona: require("../../assets/fonts/Petrona-Medium.ttf"),
    Figtree: require("../../assets/fonts/Figtree-Regular.ttf"),
    FragmentMono: require("../../assets/fonts/FragmentMono-Regular.ttf"),
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

  useEffect(() => {
    setupQuickActions();
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
      <Stack screenOptions={{ headerShown: false }} screenLayout={screenLayout} />
      <StatusBar style={isDark ? "light" : "dark"} />
    </KeyboardProvider>
  );
}
