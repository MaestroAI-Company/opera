import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library/legacy";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "../hooks/useResponsive";

const texture2 = require("../../assets/images/texture2.png");
const micIcon = require("../../assets/icons/microphone.png");
const cameraIcon = require("../../assets/icons/camera.png");
const photoIcon = require("../../assets/icons/photo.png");
const notifIcon = require("../../assets/icons/general.png");

type Permission = {
  id: string;
  icon: any;
  label: string;
  description: string;
  status: "idle" | "granted" | "denied";
  request: () => Promise<boolean>;
};

const isWeb = Platform.OS === "web";

const WEB_PERMISSIONS: Permission[] = [
  {
    id: "microphone",
    icon: micIcon,
    label: "Microphone",
    description: "To dictate your messages by voice.",
    status: "idle",
    request: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    id: "camera",
    icon: cameraIcon,
    label: "Camera",
    description: "To photograph and analyze documents.",
    status: "idle",
    request: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
        return true;
      } catch {
        return false;
      }
    },
  },
];

const NATIVE_PERMISSIONS: Permission[] = [
  {
    id: "microphone",
    icon: micIcon,
    label: "Microphone",
    description: "To dictate your messages by voice.",
    status: "idle",
    request: async () => {
      const { AudioModule } = require("expo-audio");
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      return granted;
    },
  },
  {
    id: "camera",
    icon: cameraIcon,
    label: "Camera",
    description: "To photograph and analyze documents.",
    status: "idle",
    request: async () => {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      return granted;
    },
  },
  {
    id: "photos",
    icon: photoIcon,
    label: "Photos",
    description: "To share images from your gallery.",
    status: "idle",
    request: async () => {
      const { granted } = await MediaLibrary.requestPermissionsAsync();
      return granted;
    },
  },
];

export default function PermissionsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();

  const [permissions, setPermissions] = useState<Permission[]>(
    isWeb ? WEB_PERMISSIONS : NATIVE_PERMISSIONS
  );

  const requestPermission = async (id: string) => {
    const perm = permissions.find((p) => p.id === id);
    if (!perm || perm.status !== "idle") return;

    const granted = await perm.request();
    setPermissions((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: granted ? "granted" : "denied" } : p
      )
    );
  };

  const handleContinue = () => {
    router.push("/username");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ImageBackground
        source={texture2}
        style={StyleSheet.absoluteFill}
        imageStyle={styles.backgroundTexture}
        resizeMode="cover"
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={isLargeScreen && styles.pageContentLarge}>
          <View style={styles.header}>
          <Text style={styles.title}>Permissions</Text>
          <Text style={styles.subtitle}>
            {isWeb
              ? "Opera needs a few permissions to work at its best. You can manage them at any time from your browser's site settings."
              : <>Opera needs a few permissions to work at its best. You can change them at any time in your device{" "}
                <Text style={styles.settingsLink} onPress={() => Linking.openSettings()}>
                  settings ↗
                </Text>
                .</>}
          </Text>
        </View>

        <View style={styles.list}>
          {permissions.map((perm) => {
            const isGranted = perm.status === "granted";
            const isDenied = perm.status === "denied";
            return (
              <View key={perm.id} style={styles.permissionRow}>
                <View style={styles.iconContainer}>
                  <Image
                    source={perm.icon}
                    style={styles.icon}
                    tintColor="#222"
                  />
                </View>
                <View style={styles.permissionText}>
                  <Text style={styles.permissionLabel}>{perm.label}</Text>
                  <Text style={styles.permissionDesc}>{perm.description}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.permissionBtn,
                    isGranted && styles.permissionBtnGranted,
                    isDenied && styles.permissionBtnDenied,
                    pressed && !isGranted && !isDenied && { opacity: 0.7 },
                  ]}
                  onPress={() => requestPermission(perm.id)}
                  disabled={isGranted || isDenied}
                >
                  <Text style={[
                    styles.permissionBtnText,
                    isGranted && styles.permissionBtnTextGranted,
                    isDenied && styles.permissionBtnTextDenied,
                  ]}>
                    {isGranted ? "Granted" : isDenied ? "Denied" : "Allow"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.button, isLargeScreen && styles.buttonLarge, pressed && styles.buttonPressed]}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
        <Pressable onPress={handleContinue} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
          <Text style={styles.skipText}>Skip this step</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF5EC",
  },
  backgroundTexture: {
    opacity: 0.02,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
  },
  pageContentLarge: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 640,
  },
  header: {
    marginBottom: 36,
  },
  title: {
    fontFamily: "Petrona",
    fontSize: 36,
    color: "#222",
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: "Jakarta",
    fontSize: 14,
    color: "#666",
    lineHeight: 22,
  },
  list: {
    gap: 16,
  },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    padding: 16,
    gap: 14,
    flexWrap: "wrap",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    width: 20,
    height: 20,
  },
  permissionText: {
    flex: 1,
    gap: 2,
  },
  permissionLabel: {
    fontFamily: "IBMPlexMono-Medium",
    fontSize: 14,
    color: "#222",
  },
  permissionDesc: {
    fontFamily: "Jakarta",
    fontSize: 12,
    color: "#888",
    lineHeight: 16,
  },
  settingsLink: {
    color: "#FF1A1A",
    textDecorationLine: "underline",
  },
  permissionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#00000017",
    backgroundColor: "#fff",
  },
  permissionBtnGranted: {
    backgroundColor: "#FF1A1A",
    borderColor: "#FF1A1A",
  },
  permissionBtnDenied: {
    backgroundColor: "#bbb",
    borderColor: "#bbb",
  },
  permissionBtnText: {
    fontFamily: "IBMPlexMono-Medium",
    fontSize: 12,
    color: "#222",
  },
  permissionBtnTextGranted: {
    color: "#fff",
  },
  permissionBtnTextDenied: {
    color: "#fff",
  },
  footer: {
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  button: {
    backgroundColor: "#FF1A1A",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ffffff52",
    alignItems: "center",
    width: "100%",
  },
  buttonPressed: {
    backgroundColor: "#D61515",
  },
  buttonLarge: {
    maxWidth: 420,
  },
  buttonText: {
    fontFamily: "IBMPlexMono-Medium",
    fontSize: 14,
    color: "#fff",
  },
  skipText: {
    fontFamily: "Jakarta",
    fontSize: 13,
    color: "#999",
  },
});
