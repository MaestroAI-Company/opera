import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TextInputField from "../components/ui/TextInputField";
import { useResponsive } from "../hooks/useResponsive";
import { Settings } from "../services/settings/SettingsService";

const texture2 = require("../../assets/images/texture2.png");
const profilIcon = require("../../assets/icons/pencil.png");

export default function UsernamePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();
  const [username, setUsername] = useState(() => Settings.getCached().username || "");

  const handleFinish = async () => {
    if (username.trim()) {
      await Settings.set("username", username.trim());
    }
    await Settings.set("hasSeenOnboarding", true);
    router.replace("/");
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
            <Text style={styles.title}>What should we call you?</Text>
            <Text style={styles.subtitle}>
              Enter your name to personalize your experience with Opera.
            </Text>
          </View>

          <View style={styles.inputWrapper}>
            <TextInputField
              icon={profilIcon}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your name"
              autoFocus
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.button, isLargeScreen && styles.buttonLarge, pressed && styles.buttonPressed]}
          onPress={handleFinish}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
        <Pressable onPress={handleFinish} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
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
  inputWrapper: {
    marginTop: 8,
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
