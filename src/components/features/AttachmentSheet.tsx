import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useCallback, useEffect, useState } from "react";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  Image,
  Keyboard,
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
import { DOCUMENT_MIME_TYPES, classifyDocument } from "../../services/documents/DocumentService";

const cameraIcon = require("../../../assets/icons/camera.png");
const fileIcon = require("../../../assets/icons/file.png");
const photoIcon = require("../../../assets/icons/photo.png");

//seconds to m:ss
function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export type SelectedFile = { uri: string; type: string; name: string; id?: string; mimeType?: string };

//only two audio containers accepted
const SUPPORTED_AUDIO_EXTENSIONS = ['wav', 'mp3'];
const AUDIO_EXTENSION_PATTERN = /\.(wav|mp3|m4a|aac|flac|ogg)$/;
const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|webm)$/;
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export type AttachmentKind = 'image' | 'audio' | 'video' | 'document' | 'unsupported';

export type AttachmentNotice = { title: string; message: string };

//one attach rule for all pickers
export function classifyAttachment(name: string, mimeType?: string | null): AttachmentKind {
  if (mimeType?.startsWith('image/')) return 'image';

  const lowerName = name.toLowerCase();
  if (VIDEO_EXTENSION_PATTERN.test(lowerName) || VIDEO_MIME_TYPES.includes(mimeType ?? '')) return 'video';
  if (mimeType?.startsWith('video/')) return 'unsupported';
  const looksLikeAudio = mimeType?.startsWith('audio/') || AUDIO_EXTENSION_PATTERN.test(lowerName);
  if (!looksLikeAudio) return classifyDocument(name, mimeType) ? 'document' : 'unsupported';

  const extension = lowerName.split('.').pop() ?? '';
  return SUPPORTED_AUDIO_EXTENSIONS.includes(extension) ? 'audio' : 'unsupported';
}

//owned by the screen so the sheet can cover it, the composer reads the same state
export function useAttachments(modelCapabilities: string[]) {
  const t = useT();
  const supportsImages = modelCapabilities.includes('vision');
  const supportsAudio = modelCapabilities.includes('audio');
  const supportsVideo = modelCapabilities.includes('video');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const [notice, setNotice] = useState<AttachmentNotice | null>(null);

  //the picker rejects the format, the model rejects what it cannot read
  const attachmentError = (kind: AttachmentKind, formatMessage: string) => {
    if (kind === 'unsupported') return { title: t("chatbar.unsupportedFormat"), message: formatMessage };
    if (kind === 'image' && !supportsImages) return { title: t("chatbar.unsupportedByModel"), message: t("chatbar.modelNoImages") };
    if (kind === 'audio' && !supportsAudio) return { title: t("chatbar.unsupportedByModel"), message: t("chatbar.modelNoAudio") };
    if (kind === 'video' && !supportsVideo) return { title: t("chatbar.unsupportedByModel"), message: t("chatbar.modelNoVideo") };
    return null;
  };

  const closeSheet = useCallback(() => setSheetVisible(false), []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setSheetVisible(false)
    );
    return () => {
      showSubscription.remove();
    };
  }, []);

  const toggleSheet = async () => {
    if (sheetVisible) {
      closeSheet();
    } else {
      Keyboard.dismiss();
      //no recent photos on android
      if (Platform.OS !== 'android') {
        const { granted, canAskAgain } = await MediaLibrary.getPermissionsAsync();
        //a refusal sticks, only prompt while the os still allows it
        if (!granted && canAskAgain) {
          await MediaLibrary.requestPermissionsAsync();
        }
      }
      setSheetVisible(true);
    }
  };

  useEffect(() => {
    //play policy forbids broad media access
    if (!sheetVisible || Platform.OS === 'android') return;

    const getRecentPhotos = async () => {
      const { status } = await MediaLibrary.getPermissionsAsync();
      if (status === 'granted') {
        const media = await MediaLibrary.getAssetsAsync({
          mediaType: supportsVideo ? ['photo', 'video'] : 'photo',
          first: 10,
          sortBy: ['creationTime'],
        });
        setRecentPhotos(media.assets);
      }
    };
    getRecentPhotos();
  }, [sheetVisible, supportsVideo]);

  const openCamera = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      setNotice({ title: t("chatbar.permissionDenied"), message: t("chatbar.cameraDenied") });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setFiles(prev => [...prev, {
        uri: asset.uri,
        type: 'image',
        name: asset.fileName || 'camera_image.jpg'
      }]);
      setSheetVisible(false);
    }
  };

  const pickPhotos = async () => {
    //android system picker needs no permission
    if (Platform.OS !== 'android') {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        setNotice({ title: t("chatbar.permissionDenied"), message: t("chatbar.photosDenied") });
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: supportsVideo ? ['images', 'videos'] : ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (!result.canceled && result.assets) {
      const newFiles = result.assets.map(asset => asset.type === 'video'
        ? { uri: asset.uri, type: 'video', name: asset.fileName || 'video.mp4', mimeType: asset.mimeType ?? undefined }
        : { uri: asset.uri, type: 'image', name: asset.fileName || 'photo.jpg' });
      setFiles(prev => [...prev, ...newFiles]);
      setSheetVisible(false);
    }
  };

  const toggleRecentPhoto = async (photo: any) => {
    const isVideo = photo.mediaType === 'video';
    //ios ph uri is not a file
    const videoUri = isVideo && Platform.OS === 'ios'
      ? (await MediaLibrary.getAssetInfoAsync(photo)).localUri
      : undefined;
    setFiles(prev => {
      const targetUri = videoUri || photo.uri || photo.localUri;
      const isSelected = prev.some(f => (f.id && f.id === photo.id) || f.uri === targetUri);
      if (isSelected) {
        return prev.filter(f => !((f.id && f.id === photo.id) || f.uri === targetUri));
      } else {
        return [...prev, {
          uri: targetUri,
          type: isVideo ? 'video' : 'image',
          name: photo.filename || (isVideo ? 'recent_video.mp4' : 'recent_photo.jpg'),
          id: photo.id
        }];
      }
    });
  };

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', ...(supportsVideo ? VIDEO_MIME_TYPES : []), ...DOCUMENT_MIME_TYPES],
        multiple: true,
        copyToCacheDirectory: true
      });
      if (!result.canceled && result.assets) {
        const validFiles: SelectedFile[] = [];
        let rejection: AttachmentNotice | null = null;

        for (const a of result.assets) {
          const kind = classifyAttachment(a.name, a.mimeType);
          const error = attachmentError(kind, t("chatbar.unsupportedAudio"));
          if (error) {
            rejection = error;
            continue;
          }
          validFiles.push({ uri: a.uri, type: kind, name: a.name, mimeType: a.mimeType ?? undefined });
        }

        if (rejection) setNotice(rejection);

        if (validFiles.length > 0) {
          setFiles(prev => [...prev, ...validFiles]);
        }
        setSheetVisible(false);
      }
    } catch (e) {
      console.error("Failed to pick files", e);
    }
  };

  return {
    files,
    setFiles,
    sheetVisible,
    closeSheet,
    toggleSheet,
    recentPhotos,
    attachmentError,
    openCamera,
    pickPhotos,
    pickFiles,
    toggleRecentPhoto,
    notice,
    clearNotice: () => setNotice(null),
  };
}

export type Attachments = ReturnType<typeof useAttachments>;

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
  isLargeScreen?: boolean;
  isDesktop?: boolean;
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
  isLargeScreen = false,
  isDesktop = false,
}: AttachmentSheetProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();

  return (
    <DrawerSheet
      visible={visible}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      desktopStyle={styles.desktopCard}
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.groupedBackground,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: Spacing.lg2,
  },
  desktopCard: {
    width: 380,
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
