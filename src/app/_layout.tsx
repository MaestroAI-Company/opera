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
import SettingsWindow from "../components/features/SettingsWindow";
import DesktopOverlay from "../components/features/DesktopOverlay";
import DesktopStage from "../components/features/DesktopStage";
import OverlayNoticeHost from "../components/features/OverlayNoticeHost";
import TauriTitleBar from "../components/features/TauriTitleBar";
import CodeDownloadHost from "../components/features/CodeDownloadHost";
import ToolConsentHost from "../components/features/ToolConsentHost";
import VoicePackHost from "../components/features/VoicePackHost";
import { IconLabelProvider } from "../components/ui/IconLabel";
import { Radius, Spacing } from "../../constants/theme";
import { initI18n } from "../i18n";
import { initTheme, useColors, useIsDark } from "../hooks/useTheme";
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
//the settings os window loads the app with this flag
const isSettingsWindow = isTauri && new URLSearchParams(window.location.search).get("window") === "settings";
//overlay window loads with this flag
const isOverlayWindow = isTauri && new URLSearchParams(window.location.search).get("window") === "overlay";
//fullscreen layer under the overlay bar
const isStageWindow = isTauri && new URLSearchParams(window.location.search).get("window") === "stage";

const screenLayout = ({ children }: { children: ReactNode }) => (
  <>
    <SiteHead />
    {children}
  </>
);

export default function RootLayout() {
  const isDark = useIsDark();
  const colors = useColors();
  const [showLottie, setShowLottie] = useState(Platform.OS !== "web" || (isTauri && !isSettingsWindow && !isOverlayWindow && !isStageWindow));
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
    //themed thin scrollbar over os default
    if (Platform.OS !== "web") return;
    const style = document.createElement('style');
    style.textContent = `
::-webkit-scrollbar{width:${Spacing.md}px;height:${Spacing.md}px;background:transparent}
::-webkit-scrollbar-button{display:none}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background-color:${colors.surfacePressed};border:${Spacing.xs2}px solid transparent;border-radius:${Radius.pill}px;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover,::-webkit-scrollbar-thumb:active{background-color:${colors.textMuted}}
@supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:${colors.surfacePressed} transparent}}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [colors]);

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

  if (isStageWindow) return <DesktopStage />;

  if (isOverlayWindow) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <IconLabelProvider>
          <DesktopOverlay />
        </IconLabelProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <IconLabelProvider>
          <TauriTitleBar />
          {isSettingsWindow ? (
            <SettingsWindow />
          ) : (
            <>
              <Stack screenOptions={{ headerShown: false }} screenLayout={screenLayout} />
              <ToolConsentHost />
              <VoicePackHost />
              <CodeDownloadHost />
              <OverlayNoticeHost />
            </>
          )}
          <StatusBar style={isDark ? "light" : "dark"} />
        </IconLabelProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
