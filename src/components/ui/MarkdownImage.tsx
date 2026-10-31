import React, { useEffect, useMemo, useState } from "react";
import {
  DeviceEventEmitter,
  Image as RNImage,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image, ImageLoadEventData } from "expo-image";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useIsDark, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { AppEvents } from "../../services/events";
import { RemoteImages } from "../../services/net/remoteImages";
import { BROWSER_UA } from "../../services/net/userAgent";
import { Settings } from "../../services/settings/SettingsService";
import { pressStyle } from "./pressStyle";

const websiteIcon = require("../../../assets/icons/website.png");
const photoIcon = require("../../../assets/icons/photo.png");

//hosts reject the default agent
const IMAGE_HEADERS = { "User-Agent": BROWSER_UA };

export type MarkdownImageProps = {
  url: string;
  alt?: string;
  title?: string;
  incognito?: boolean;
  dark?: boolean;
};

export default function MarkdownImage({
  url,
  alt,
  title,
  incognito,
  dark,
}: MarkdownImageProps) {
  const Colors = useColors();
  const themeDark = useIsDark();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const isDark = dark ?? themeDark;

  const isRemote = useMemo(() => /^https?:\/\//i.test(url), [url]);
  const [alwaysShowRemote, setAlwaysShowRemote] = useState(() => Settings.getCached().showRemoteImages);
  //approved by read_image or another card
  const [revealed, setRevealed] = useState(() => RemoteImages.isAllowed(url));
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<{ url: string; isLoading: boolean; hasError: boolean }>({
    url,
    isLoading: true,
    hasError: false,
  });

  const isLoading = loadState.url === url ? loadState.isLoading : true;
  const hasError = loadState.url === url ? loadState.hasError : false;

  //sync remote image preference changes
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => {
      setAlwaysShowRemote(Settings.getCached().showRemoteImages);
    });
    return () => sub.remove();
  }, []);

  const shouldDisplay = !isRemote || alwaysShowRemote || revealed;

  //display hostname in warning badge
  const domain = useMemo(() => {
    if (!isRemote) return "";
    try {
      return new URL(url).hostname;
    } catch {
      const match = url.match(/^https?:\/\/([^/?#]+)/i);
      return match ? match[1] : "";
    }
  }, [url, isRemote]);

  //derive aspect ratio from image metadata
  const handleLoad = (e: ImageLoadEventData) => {
    setLoadState({ url, isLoading: false, hasError: false });
    const src = e.source;
    if (src?.width && src?.height) {
      setAspectRatio(src.width / src.height);
    }
  };

  const handleError = () => {
    setLoadState({ url, isLoading: false, hasError: true });
  };

  const handleShowOnce = () => {
    RemoteImages.allow(url);
    setRevealed(true);
  };

  //save choice to persistent settings
  const handleAlwaysShow = () => {
    Settings.set("showRemoteImages", true);
    setRevealed(true);
  };

  //open full image preview modal
  const handleOpenPreview = () => {
    DeviceEventEmitter.emit(AppEvents.openImagePreview, { uri: url });
  };

  const cardBg = isDark ? Colors.responseSurface : Colors.surface;
  const borderColor = incognito
    ? Colors.incognito
    : isDark
      ? Colors.responseBorder
      : Colors.border;
  const titleColor = isDark ? Colors.responseTextStrong : Colors.textPrimary;
  const bodyColor = isDark ? Colors.responseText : Colors.textSecondary;
  const mutedColor = isDark ? Colors.responseTextMuted : Colors.textMuted;
  const badgeBg = isDark ? Colors.overlaySubtle : Colors.surfaceSubtle;

  if (!shouldDisplay) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.warningHeader}>
          <View style={styles.warningTitleRow}>
            <RNImage
              source={websiteIcon}
              style={styles.warningIcon}
              tintColor={incognito ? Colors.incognito : Colors.primary}
            />
            <Text style={[styles.warningTitle, { color: titleColor }]}>
              {t("markdown.image.external")}
            </Text>
          </View>
          {!!domain && (
            <View style={[styles.domainBadge, { backgroundColor: badgeBg }]}>
              <Text style={[styles.domainText, { color: mutedColor }]} numberOfLines={1}>
                {domain}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.warningText, { color: bodyColor }]}>
          {t("markdown.image.warning", { domain: domain || url })}
        </Text>
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleShowOnce}
            style={pressStyle(
              [styles.buttonSecondary, { borderColor }],
              "surface"
            )}
          >
            <Text style={[styles.buttonSecondaryText, { color: titleColor }]}>
              {t("markdown.image.show")}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleAlwaysShow}
            style={pressStyle(
              [
                styles.buttonPrimary,
                incognito && { backgroundColor: Colors.incognito, borderColor: Colors.borderOnPrimary },
              ],
              {
                backgroundColor: incognito ? Colors.incognitoBright : Colors.primaryBright,
                borderColor: incognito ? Colors.incognitoBright : Colors.primaryBright,
              }
            )}
          >
            <Text style={styles.buttonPrimaryText}>
              {t("markdown.image.alwaysShow")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <Pressable onPress={handleOpenPreview} style={pressStyle(styles.imageWrap, "fadeLight")}>
        {isLoading && (
          <View
            style={[
              styles.placeholder,
              { backgroundColor: badgeBg, aspectRatio: aspectRatio ?? 16 / 9 },
            ]}
          >
            <RNImage source={photoIcon} style={styles.placeholderIcon} tintColor={mutedColor} />
          </View>
        )}
        {hasError ? (
          <View style={[styles.errorBox, { aspectRatio: 16 / 9 }]}>
            <RNImage source={photoIcon} style={styles.placeholderIcon} tintColor={Colors.error} />
            <Text style={[styles.errorText, { color: mutedColor }]}>
              {t("markdown.image.failed")}
            </Text>
          </View>
        ) : (
          <Image
            source={isRemote ? { uri: url, headers: IMAGE_HEADERS } : { uri: url }}
            style={[
              styles.image,
              { aspectRatio: aspectRatio ?? 16 / 9 },
              isLoading && styles.hiddenImage,
            ]}
            contentFit="contain"
            cachePolicy="memory-disk"
            allowDownscaling
            onLoad={handleLoad}
            onError={handleError}
            alt={alt || title || "Image"}
            accessibilityLabel={alt || title || "Image"}
          />
        )}
      </Pressable>
      {(!!alt || !!title) && (
        <View style={[styles.captionBar, { borderTopColor: borderColor }]}>
          <Text style={[styles.captionText, { color: mutedColor }]} numberOfLines={2}>
            {alt || title}
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: Radius.xxl,
      borderWidth: 2,
      marginVertical: Spacing.md,
      overflow: "hidden",
      shadowColor: Colors.shadowInk,
      shadowOffset: { width: -3, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 2,
    },
    warningHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.xs,
      gap: Spacing.md,
    },
    warningTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    warningIcon: {
      width: 16,
      height: 16,
    },
    warningTitle: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      letterSpacing: 0.5,
    },
    domainBadge: {
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs2,
      maxWidth: "50%",
    },
    domainText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.labelSm,
    },
    warningText: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      lineHeight: 18,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.sm,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.lg,
      paddingTop: Spacing.xs,
    },
    buttonSecondary: {
      flexGrow: 1,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
    },
    buttonSecondaryText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
    },
    buttonPrimary: {
      flexGrow: 1,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      backgroundColor: Colors.primary,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
    },
    buttonPrimaryText: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textOnPrimary,
    },
    imageWrap: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    image: {
      width: "100%",
      maxHeight: 440,
    },
    hiddenImage: {
      opacity: 0,
      position: "absolute",
    },
    placeholder: {
      width: "100%",
      maxHeight: 440,
      alignItems: "center",
      justifyContent: "center",
    },
    placeholderIcon: {
      width: 32,
      height: 32,
      opacity: 0.6,
    },
    errorBox: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      padding: Spacing.xl,
      gap: Spacing.sm,
    },
    errorText: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
    },
    captionBar: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderTopWidth: 1,
      alignItems: "center",
    },
    captionText: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
    },
  });
