import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  Image,
  Platform,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Group from "../ui/Group";
import DrawerSheet from "./DrawerSheet";
import { pressStyle } from "../ui/pressStyle";

const cameraIcon = require("../../../assets/icons/camera.png");
const fileIcon = require("../../../assets/icons/file.png");
const photoIcon = require("../../../assets/icons/photo.png");

//seconds to m:ss
function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export type SelectedFile = { uri: string; type: string; name: string; id?: string; mimeType?: string };

type AttachmentSheetProps = {
  visible: boolean;
  incognito?: boolean;
  onClose: () => void;
  onCamera: () => void;
  onPickFiles: () => void;
  onPhotos: () => void;
  recentPhotos: any[];
  selectedFiles: SelectedFile[];
  onSelectRecentPhoto: (photo: any) => void;
  onLongPressRecentPhoto: (photo: any) => void;
  bottomInset?: number;
};

export default function AttachmentSheet({
  visible,
  incognito = false,
  onClose,
  onCamera,
  onPickFiles,
  onPhotos,
  recentPhotos,
  selectedFiles,
  onSelectRecentPhoto,
  onLongPressRecentPhoto,
  bottomInset = 0,
}: AttachmentSheetProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();

  return (
    <DrawerSheet
      visible={visible}
      //lifts the bar instead of overlaying it
      mode="lift"
      //sheet pads its own safe area and overlaps the inset below
      liftOffset={bottomInset}
      onClose={onClose}
      handleContainerStyle={styles.sheetHandleContainer}
      handleStyle={[styles.sheetHandle, incognito && styles.sheetHandleIncognito]}
      sheetStyle={[
        styles.sheet,
        incognito && styles.inlineSheetIncognito,
        { paddingBottom: (Platform.OS === 'ios' ? 20 : 10) + bottomInset },
      ]}
    >
      <View style={styles.sheetButtonsWrapper}>
        <Group style={[styles.sheetButtonsRow, incognito && styles.sheetButtonsRowIncognito]}>
          {[
            { icon: cameraIcon, label: t("attachment.camera"), onPress: onCamera },
            { icon: fileIcon, label: t("attachment.file"), onPress: onPickFiles },
            { icon: photoIcon, label: t("attachment.photos"), onPress: onPhotos },
          ].map(({ icon, label, onPress }) => (
            //flex on cell since group adds a layer
            <View key={label} style={styles.sheetIconButtonCell}>
              <Group style={incognito && styles.sheetIconButtonGroupIncognito}>
                <Pressable style={pressStyle(styles.sheetIconButton, { backgroundColor: incognito ? Colors.incognito : Colors.surfacePressed })} onPress={onPress}>
                  <Image source={icon} style={[styles.sheetIcon, incognito && styles.sheetIconIncognito]} />
                  <Text style={[styles.sheetIconText, incognito && styles.sheetTextIncognito]}>{label}</Text>
                </Pressable>
              </Group>
            </View>
          ))}
        </Group>
      </View>

      {recentPhotos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sheetRecentPhotosContainer} keyboardShouldPersistTaps="handled">
          {recentPhotos.map((photo) => (
            <TouchableOpacity
              activeOpacity={0.8}
              key={photo.id}
              onPress={() => onSelectRecentPhoto(photo)}
              onLongPress={() => onLongPressRecentPhoto(photo)}
              style={styles.sheetRecentPhotoWrapper}
            >
              <Image
                source={{ uri: photo.uri || photo.localUri }}
                style={[
                  styles.sheetRecentPhoto,
                  {
                    opacity: selectedFiles.some(f => (f.id && f.id === photo.id) || f.uri === (photo.uri || photo.localUri)) ? 0.7 : 1,
                    borderWidth: 2,
                    borderColor: selectedFiles.some(f => (f.id && f.id === photo.id) || f.uri === (photo.uri || photo.localUri))
                      ? (incognito ? Colors.textOnPrimary : Colors.primary)
                      : 'transparent'
                  }
                ]}
              />
              {photo.mediaType === 'video' && (
                <Text style={styles.sheetRecentVideoDuration}>{formatDuration(photo.duration ?? 0)}</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </DrawerSheet>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  sheet: {
    backgroundColor: Colors.groupedBackground,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: Spacing.lg2,
    width: '100%',
  },
  inlineSheetIncognito: {
    backgroundColor: Colors.incognitoSurface,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.incognitoPressed,
  },
  sheetHandleContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xs2,
    paddingVertical: Spacing.lg,
    marginTop: -Spacing.lg,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.textMuted,
  },
  sheetHandleIncognito: {
    backgroundColor: Colors.incognito,
  },
  sheetButtonsWrapper: {
    paddingHorizontal: Spacing.lg2,
    marginBottom: 12,
  },
  sheetButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.xxl + Spacing.md,
    borderWidth: 0,
  },
  sheetButtonsRowIncognito: {
    backgroundColor: Colors.incognitoSurface,
  },
  sheetIconButtonCell: {
    flex: 1,
  },
  sheetIconButtonGroupIncognito: {
    backgroundColor: Colors.incognitoPressed,
    borderColor: Colors.incognito,
  },
  sheetIconButton: {
    height: 84,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetIcon: {
    width: 22,
    height: 22,
    marginBottom: 6,
    tintColor: Colors.textPrimary,
  },
  sheetIconIncognito: {
    tintColor: Colors.textOnPrimary,
  },
  sheetIconText: {
    fontSize: FontSizes.label,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
  },
  sheetTextIncognito: {
    color: Colors.textOnPrimary,
  },
  sheetRecentPhotosContainer: {
    paddingHorizontal: Spacing.lg2,
    paddingBottom: 8,
  },
  sheetRecentPhotoWrapper: {
    marginRight: 10,
    borderRadius: Radius.xxl,
  },
  sheetRecentPhoto: {
    width: 80,
    height: 80,
    borderRadius: Radius.xxl,
  },
  sheetRecentVideoDuration: {
    position: 'absolute',
    right: Spacing.sm,
    bottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.scrimModal,
    color: Colors.textOnPrimary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.mono,
  },
});
