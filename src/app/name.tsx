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
import { Colors, Fonts, FontSizes, Radius } from "../../constants/theme";

const texture2 = require("../../assets/images/texture2.png");
const profilIcon = require("../../assets/icons/pencil.png");

export default function NamePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();
  const [name, setName] = useState(() => Settings.getCached().name || "");

  const handleFinish = async () => {
    if (name.trim()) {
      await Settings.set("name", name.trim());
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
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              autoFocus
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed, hovered }) => [styles.button, isLargeScreen && styles.buttonLarge, (pressed || hovered) && styles.buttonPressed]}
          onPress={handleFinish}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
        <Pressable onPress={handleFinish} style={({ pressed, hovered }) => [(pressed || hovered) && { opacity: 0.5 }]}>
          <Text style={styles.skipText}>Skip this step</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    fontFamily: Fonts.display,
    fontSize: FontSizes.displayLg,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.bodyMd,
    color: Colors.textBody,
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
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    alignItems: "center",
    width: "100%",
  },
  buttonPressed: {
    backgroundColor: Colors.primaryPressed,
  },
  buttonLarge: {
    maxWidth: 420,
  },
  buttonText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.surface,
  },
  skipText: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.caption,
    color: Colors.textDisabled,
  },
});
