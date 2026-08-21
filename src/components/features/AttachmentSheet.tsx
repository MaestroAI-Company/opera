import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
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
import DrawerSheet from "./DrawerSheet";

const cameraIcon = require("../../../assets/icons/camera.png");
const fileIcon = require("../../../assets/icons/file.png");
const photoIcon = require("../../../assets/icons/photo.png");

//lifts bar instead of overlaying
export const ATTACHMENT_SHEET_LIFTS = true;

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

  return (
    <DrawerSheet
      visible={visible}
      mode={ATTACHMENT_SHEET_LIFTS ? "lift" : "overlay"}
      //inset real below, sheet self-pads
      liftOffset={bottomInset}
      onClose={onClose}
      handleContainerStyle={styles.sheetHandleContainer}
      handleStyle={[styles.sheetHandle, incognito && styles.sheetHandleIncognito]}
      sheetStyle={[
        styles.sheet,
        incognito && styles.inlineSheetIncognito,
        { paddingBottom: (Platform.OS === 'ios' ? 20 : 10) + (ATTACHMENT_SHEET_LIFTS ? 0 : bottomInset) },
      ]}
    >
      <View style={styles.sheetButtonsRow}>
        <Pressable style={({ pressed, hovered }) => [styles.sheetIconButton, incognito && styles.sheetIconButtonIncognito, (pressed || hovered) && { backgroundColor: incognito ? Colors.incognito : Colors.surfacePressed }]} onPress={onCamera}>
          <Image source={cameraIcon} style={[styles.sheetIcon, incognito && styles.sheetIconIncognito]} />
          <Text style={[styles.sheetIconText, incognito && styles.sheetTextIncognito]}>Camera</Text>
        </Pressable>
        <Pressable style={({ pressed, hovered }) => [styles.sheetIconButton, incognito && styles.sheetIconButtonIncognito, (pressed || hovered) && { backgroundColor: incognito ? Colors.incognito : Colors.surfacePressed }]} onPress={onPickFiles}>
          <Image source={fileIcon} style={[styles.sheetIcon, incognito && styles.sheetIconIncognito]} />
          <Text style={[styles.sheetIconText, incognito && styles.sheetTextIncognito]}>File</Text>
        </Pressable>
        <Pressable style={({ pressed, hovered }) => [styles.sheetIconButton, incognito && styles.sheetIconButtonIncognito, (pressed || hovered) && { backgroundColor: incognito ? Colors.incognito : Colors.surfacePressed }]} onPress={onPhotos}>
          <Image source={photoIcon} style={[styles.sheetIcon, incognito && styles.sheetIconIncognito]} />
          <Text style={[styles.sheetIconText, incognito && styles.sheetTextIncognito]}>Photos</Text>
        </Pressable>
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
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </DrawerSheet>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: 12,
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
    marginBottom: 12,
    paddingVertical: 10,
    marginTop: -10,
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
  sheetButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sheetIconButton: {
    flex: 1,
    height: 70,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  sheetIconButtonIncognito: {
    backgroundColor: Colors.incognitoPressed,
    borderColor: Colors.incognito,
  },
  sheetIcon: {
    width: 18,
    height: 18,
    marginBottom: 4,
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
    paddingHorizontal: 16,
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
});
