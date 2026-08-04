import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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

const butterflyImage = require("../../assets/images/butterfly2.png");
const texture2 = require("../../assets/images/texture2.png");
const logoImage = require("../../assets/icons/opera.png");

const FULL_TEXT = "AI for all,\nprivacy for freedom";

export default function StartingPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();

  const [displayedText, setDisplayedText] = useState("");

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(-20)).current;

  const butterflyOpacity = useRef(new Animated.Value(0)).current;
  const butterflyScale = useRef(new Animated.Value(0.85)).current;

  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslateY = useRef(new Animated.Value(20)).current;

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
        if (currentIndex < FULL_TEXT.length) {
          currentIndex++;
          setDisplayedText(FULL_TEXT.slice(0, currentIndex));
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
        <Image source={logoImage} style={styles.logo} tintColor="#fff" resizeMode="contain" />
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
            {FULL_TEXT}
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
          style={({ pressed }) => [styles.button, isLargeScreen && styles.buttonLarge, pressed && styles.buttonPressed]}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>Get started</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FF1A1A",
  },
  backgroundTexture: {
    opacity: 0.05,
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
    fontFamily: "Petrona",
    fontSize: 48,
    color: "#fff",
    textAlign: "left",
    lineHeight: 52,
  },
  titleLarge: {
    fontSize: 64,
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
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    alignItems: "center",
    width: "100%",
  },
  buttonPressed: {
    backgroundColor: "#eaeaea",
  },
  buttonLarge: {
    maxWidth: 420,
  },
  buttonText: {
    fontFamily: "IBMPlexMono-Medium",
    fontSize: 14,
    color: "#222",
  },
});
