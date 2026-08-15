import { useEffect, useRef, useState } from 'react';
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import {
  Animated,
  Image,
  Modal,
  PanResponder,
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

//clears the tallest sheet content so it starts fully off-screen
const SHEET_OFFSET = 500;

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
  //enough to clear any sheet height, kept mounted until the close animation finishes
  const [renderModal, setRenderModal] = useState(visible);
  const backdropOpacity = useAnimatedValue(0);
  const sheetY = useAnimatedValue(SHEET_OFFSET);

  //scrim fades in place, sheet slides, driven separately so the modal itself does no transform
  useEffect(() => {
    if (visible) {
      setRenderModal(true);
      backdropOpacity.setValue(0);
      sheetY.setValue(SHEET_OFFSET);
      //let the modal actually mount before animating, starting both in the same tick as the mount is what caused the opening stutter
      const raf = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, overshootClamping: true, bounciness: 0, speed: 14 }),
        ]).start();
      });
      return () => cancelAnimationFrame(raf);
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(sheetY, { toValue: SHEET_OFFSET, duration: 180, useNativeDriver: true }),
      ]).start(() => setRenderModal(false));
    }
  }, [visible, backdropOpacity, sheetY]);

  //drag handle mirrors a native sheet's swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, gestureState) => {
        if (gestureState.dy > 0) {
          sheetY.setValue(gestureState.dy);
          backdropOpacity.setValue(Math.max(0, 1 - gestureState.dy / SHEET_OFFSET));
        }
      },
      onPanResponderRelease: (_e, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          onClose();
        } else {
          Animated.parallel([
            Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, overshootClamping: true, bounciness: 0, speed: 14 }),
            Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  return (
    <Modal visible={renderModal} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdropRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Pressable style={styles.sheetTouchArea} onPress={() => {}}>
          <Animated.View style={{ transform: [{ translateY: sheetY }] }}>
            <View style={[
              styles.inlineSheet,
              incognito && styles.inlineSheetIncognito,
              { paddingBottom: (Platform.OS === 'ios' ? 20 : 10) + bottomInset }
            ]}>
              <View style={styles.sheetHandleContainer} {...panResponder.panHandlers}>
                <View style={[styles.sheetHandle, incognito && styles.sheetHandleIncognito]} />
              </View>

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
                              ? (incognito ? Colors.surface : Colors.primary)
                              : 'transparent'
                          }
                        ]}
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: Colors.scrimModal,
  },
  sheetTouchArea: {
    width: '100%',
  },
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
  },
  sheetRecentPhoto: {
    width: 80,
    height: 80,
    borderRadius: Radius.xxl,
  },
});
