import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Animated,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "../hooks/useResponsive";
import { useT } from "../i18n";
import { FontSizes, Fonts, Radius, ThemeColors } from "../../constants/theme";
import { useColors, useThemedStyles } from "../hooks/useTheme";
import { useAnimatedValue } from "../hooks/useAnimatedValue";

const butterflyImage = require("../../assets/images/butterfly2.png");
const texture2 = require("../../assets/images/texture2.png");
const logoImage = require("../../assets/icons/opera.png");

export default function StartingPage() {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();

  const fullText = t("onboarding.start.tagline");
  const [displayedText, setDisplayedText] = useState("");

  const logoOpacity = useAnimatedValue(0);
  const logoTranslateY = useAnimatedValue(-20);

  const butterflyOpacity = useAnimatedValue(0);
  const butterflyScale = useAnimatedValue(0.85);

  const buttonOpacity = useAnimatedValue(0);
  const buttonTranslateY = useAnimatedValue(20);

  useEffect(() => {
    // 1. Logo & Butterfly animation
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(logoTranslateY, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(250),
        Animated.parallel([
          Animated.timing(butterflyOpacity, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.spring(butterflyScale, {
            toValue: 1,
            friction: 6,
            tension: 40,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    // 2. Typewriter effect for text starting at t=600ms
    let currentIndex = 0;
    let timer: any;

    const startDelay = setTimeout(() => {
      timer = setInterval(() => {
        if (currentIndex < fullText.length) {
          currentIndex++;
          setDisplayedText(fullText.slice(0, currentIndex));
        } else {
          clearInterval(timer);
          // 3. Trigger button appearance when typing completes
          Animated.parallel([
            Animated.timing(buttonOpacity, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(buttonTranslateY, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
          ]).start();
        }
      }, 45);
    }, 600);

    return () => {
      clearTimeout(startDelay);
      if (timer) clearInterval(timer);
    };
  }, [
    fullText,
    logoOpacity,
    logoTranslateY,
    butterflyOpacity,
    butterflyScale,
    buttonOpacity,
    buttonTranslateY,
  ]);

  const handleContinue = () => {
    router.push("/permissions");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ImageBackground
        source={texture2}
        style={StyleSheet.absoluteFill}
        imageStyle={styles.backgroundTexture}
        resizeMode="cover"
      />

      {/* Top Bar Logo */}
      <Animated.View
        style={[
          styles.topBar,
          {
            opacity: logoOpacity,
            transform: [{ translateY: logoTranslateY }],
          },
        ]}
      >
        <Image source={logoImage} style={styles.logo} tintColor={Colors.textOnPrimary} resizeMode="contain" />
      </Animated.View>

      {/* Content */}
      <View style={[styles.content, isLargeScreen && styles.contentLarge]}>
        <Animated.Image
          source={butterflyImage}
          style={[
            styles.image,
            isLargeScreen && styles.imageLarge,
            {
              opacity: butterflyOpacity,
              transform: [{ scale: butterflyScale }],
            },
          ]}
          resizeMode="contain"
        />
        <View style={styles.titleWrapper}>
          {/* Reserve layout dimensions to prevent any layout shifts */}
          <Text style={[styles.title, isLargeScreen && styles.titleLarge, { opacity: 0 }]}>
            {fullText}
          </Text>
          {/* Typewriter text overlay */}
          <Text style={[styles.title, isLargeScreen && styles.titleLarge, styles.titleOverlay]}>
            {displayedText}
          </Text>
        </View>
      </View>

      {/* Footer Button */}
      <Animated.View
        style={[
          styles.footer,
          {
            opacity: buttonOpacity,
            transform: [{ translateY: buttonTranslateY }],
          },
        ]}
      >
        <Pressable
          style={({ pressed, hovered }) => [styles.button, isLargeScreen && styles.buttonLarge, (pressed || hovered) && styles.buttonPressed]}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>{t("onboarding.start.cta")}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  backgroundTexture: {
    opacity: 0.05,
    width: "100%",
    height: "100%",
  },
  topBar: {
    paddingHorizontal: 24,
    paddingTop: 20,
    alignItems: "center",
  },
  logo: {
    width: 180,
    height: 80,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  contentLarge: {
    paddingHorizontal: 48,
    alignItems: "center",
  },
  image: {
    width: 250,
    height: 250,
    alignSelf: "flex-start",
    marginBottom: 20,
    marginLeft: -20,
  },
  imageLarge: {
    width: 340,
    height: 340,
    alignSelf: "center",
    marginLeft: 0,
  },
  titleWrapper: {
    position: "relative",
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.displayHero,
    color: Colors.textOnPrimary,
    textAlign: "left",
    lineHeight: 52,
  },
  titleLarge: {
    fontSize: FontSizes.displayHuge,
    lineHeight: 72,
  },
  titleOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    padding: 40,
    alignItems: "center",
  },
  button: {
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    width: "100%",
  },
  buttonPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  buttonLarge: {
    maxWidth: 420,
  },
  buttonText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.textSecondary,
  },
});
