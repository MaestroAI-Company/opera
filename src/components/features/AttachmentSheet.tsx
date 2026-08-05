import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
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

const cameraIcon = require("../../../assets/icons/camera.png");
const fileIcon = require("../../../assets/icons/file.png");
const photoIcon = require("../../../assets/icons/photo.png");

export type SelectedFile = { uri: string; type: string; name: string; id?: string };

type AttachmentSheetProps = {
  visible: boolean;
  incognito?: boolean;
  onCamera: () => void;
  onPickFiles: () => void;
  onPhotos: () => void;
  recentPhotos: any[];
  selectedFiles: SelectedFile[];
  onSelectRecentPhoto: (photo: any) => void;
  onLongPressRecentPhoto: (photo: any) => void;
  panHandlers?: any;
  bottomInset?: number;
};

export default function AttachmentSheet({
  visible,
  incognito = false,
  onCamera,
  onPickFiles,
  onPhotos,
  recentPhotos,
  selectedFiles,
  onSelectRecentPhoto,
  onLongPressRecentPhoto,
  panHandlers,
  bottomInset = 0,
}: AttachmentSheetProps) {
  // allow continuous height measurement
  return (
    <View style={[
      styles.inlineSheet,
      incognito && styles.inlineSheetIncognito,
      { paddingBottom: (Platform.OS === 'ios' ? 20 : 10) + bottomInset }
    ]}>
      <View style={styles.sheetHandleContainer} {...panHandlers}>
        <View style={[styles.sheetHandle, incognito && styles.sheetHandleIncognito]} />
      </View>

      <View style={styles.sheetButtonsRow}>
        <Pressable style={[styles.sheetIconButton, incognito && styles.sheetIconButtonIncognito]} onPress={onCamera}>
          <Image source={cameraIcon} style={[styles.sheetIcon, incognito && styles.sheetIconIncognito]} />
          <Text style={[styles.sheetIconText, incognito && styles.sheetTextIncognito]}>Camera</Text>
        </Pressable>
        <Pressable style={[styles.sheetIconButton, incognito && styles.sheetIconButtonIncognito]} onPress={onPickFiles}>
          <Image source={fileIcon} style={[styles.sheetIcon, incognito && styles.sheetIconIncognito]} />
          <Text style={[styles.sheetIconText, incognito && styles.sheetTextIncognito]}>File</Text>
        </Pressable>
        <Pressable style={[styles.sheetIconButton, incognito && styles.sheetIconButtonIncognito]} onPress={onPhotos}>
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
              style={[
                styles.sheetRecentPhotoWrapper,
                {
                  borderWidth: 2,
                  borderColor: selectedFiles.some(f => (f.id && f.id === photo.id) || f.uri === (photo.uri || photo.localUri))
                    ? (incognito ? Colors.surface : Colors.primary)
                    : 'transparent'
                }
              ]}
            >
              <Image
                source={{ uri: photo.uri || photo.localUri }}
                style={[
                  styles.sheetRecentPhoto,
                  { opacity: selectedFiles.some(f => (f.id && f.id === photo.id) || f.uri === (photo.uri || photo.localUri)) ? 0.7 : 1 }
                ]}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
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
    marginBottom: 20,
    paddingVertical: 10,
    marginTop: -10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.textDisabledStrong,
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
    borderColor: Colors.codeBlockText,
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
    tintColor: Colors.surface,
  },
  sheetIconText: {
    fontSize: FontSizes.label,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
  },
  sheetTextIncognito: {
    color: Colors.surface,
  },
  sheetRecentPhotosContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetRecentPhotoWrapper: {
    marginRight: 10,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },
  sheetRecentPhoto: {
    width: 80,
    height: 80,
    borderRadius: Radius.xxl,
  },
});
