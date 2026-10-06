import { useEffect, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import DrawerSheet from "./DrawerSheet";

const DESKTOP_CARD_WIDTH = 420;

export type PreviewImage = { uri: string };

type ImagePreviewSheetProps = {
  image: PreviewImage | null;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  bottomInset?: number;
};

//metadata readable from the uri alone
function describeUri(uri: string): { name: string | null; format: string | null; bytes: number | null } {
  const dataMatch = uri.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (dataMatch) {
    const format = dataMatch[1].split("/").pop()?.toUpperCase() ?? null;
    const payload = dataMatch[3];
    //base64 expands bytes by four thirds
    const bytes = dataMatch[2] ? Math.floor(payload.length * 3 / 4) - (payload.match(/=*$/)?.[0].length ?? 0) : null;
    return { name: null, format, bytes };
  }
  const path = uri.split("?")[0];
  let name = path.split("/").pop() || null;
  try {
    if (name) name = decodeURIComponent(name);
  } catch {}
  const ext = name?.match(/\.(\w+)$/)?.[1];
  return { name, format: ext ? ext.toUpperCase() : null, bytes: null };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

//full size view of a sent image
export default function ImagePreviewSheet({ image, onClose, isLargeScreen = false, isDesktop = false, bottomInset = 0 }: ImagePreviewSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  //last image stays during close animation
  const [shown, setShown] = useState<PreviewImage | null>(image);
  if (image && image !== shown) setShown(image);
  const [measured, setMeasured] = useState<{ uri: string; width: number; height: number } | null>(null);
  const size = measured && measured.uri === shown?.uri ? measured : null;

  useEffect(() => {
    if (!image) return;
    Image.getSize(image.uri, (width, height) => setMeasured({ uri: image.uri, width, height }), () => {});
  }, [image]);

  const info = shown ? describeUri(shown.uri) : null;
  const rows = [
    info?.name ? { label: t("imagePreview.name"), value: info.name } : null,
    info?.format ? { label: t("imagePreview.format"), value: info.format } : null,
    size ? { label: t("imagePreview.dimensions"), value: `${size.width} × ${size.height}` } : null,
    info?.bytes != null ? { label: t("imagePreview.size"), value: formatBytes(info.bytes) } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <DrawerSheet
      visible={!!image}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      //sheet may grow up to just under the status bar
      sheetStyle={[styles.sheet, { paddingBottom: (Platform.OS === "ios" ? 20 : 10) + bottomInset, maxHeight: windowHeight - insets.top - Spacing.xl2 }]}
      desktopStyle={styles.desktopCard}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {shown && (
          <Group style={styles.infoGroup}>
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: shown.uri }}
                resizeMode="contain"
                onLoad={(e) => {
                  //web passes the dom event without source, getSize covers it
                  const source = e.nativeEvent.source;
                  if (source && source.width > 0 && source.height > 0) {
                    setMeasured({ uri: shown.uri, width: source.width, height: source.height });
                  }
                }}
                style={[
                  styles.image,
                  size ? { aspectRatio: size.width / size.height } : styles.imagePlaceholder,
                ]}
              />
            </View>
            {rows.map(row => (
              <ActionButton
                key={row.label}
                label={row.label}
                rightElement={<Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">{row.value}</Text>}
              />
            ))}
          </Group>
        )}
      </ScrollView>
    </DrawerSheet>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.groupedBackground,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: Spacing.lg2,
  },
  desktopCard: {
    width: DESKTOP_CARD_WIDTH,
  },
  sheetHandleContainer: {
    alignItems: "center",
    marginBottom: Spacing.xs2,
    paddingVertical: Spacing.lg,
    marginTop: -Spacing.lg,
  },
  content: {
    paddingHorizontal: Spacing.lg2,
    paddingBottom: Spacing.lg,
  },
  imageContainer: {
    padding: Spacing.md,
    alignItems: "center",
  },
  image: {
    width: "100%",
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  imagePlaceholder: {
    aspectRatio: 1,
  },
  infoGroup: {
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
  },
  //label takes the rest of the row
  infoValue: {
    flexShrink: 1,
    maxWidth: "60%",
    textAlign: "right",
    color: Colors.textMuted,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
  },
});
