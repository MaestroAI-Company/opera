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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import SiteHead from "../components/SiteHead";
import SplashScreenComponent from "../components/ui/SplashScreen";
import TauriTitleBar from "../components/features/TauriTitleBar";
import ToolConsentHost from "../components/features/ToolConsentHost";
import { IconLabelProvider } from "../components/ui/IconLabel";
import { Radius } from "../../constants/theme";
import { initI18n } from "../i18n";
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

//expo static analysis runs without window
if (typeof window !== "undefined") {
  //resolve palette before first paint
  initTheme();

  //resolve locale before first paint
  initI18n();

  //crash reported on next launch
  installCrashHandler();
}

//bug reports carry console output
installLogger();

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const isLinux = isTauri && navigator.userAgent.includes("Linux") && !navigator.userAgent.includes("Android");

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
    //rounds the window during splash, before TauriTitleBar mounts
    if (!isLinux) return;
    const style = document.createElement('style');
    style.textContent = `#root{border-radius:${Radius.window}px;overflow:hidden}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <IconLabelProvider>
          <TauriTitleBar />
          <Stack screenOptions={{ headerShown: false }} screenLayout={screenLayout} />
          <ToolConsentHost />
          <StatusBar style={isDark ? "light" : "dark"} />
        </IconLabelProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
