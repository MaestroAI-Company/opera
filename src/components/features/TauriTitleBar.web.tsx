import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Image } from 'react-native';
import Svg, { Path, Line, Rect } from 'react-native-svg';
import { Colors, Fonts, FontSizes } from "../../../constants/theme";

// detect the tauri desktop shell and its host os
function detectShell() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return { isTauri: false, isMac: false };
  }
  const isWindowsOS = navigator.userAgent.includes("Windows") || navigator.userAgent.includes("Win32");
  const isMacOS = navigator.userAgent.includes("Mac");
  return { isTauri: isWindowsOS || isMacOS, isMac: isMacOS };
}

export default function TauriTitleBar() {
  const [{ isTauri, isMac }] = useState(detectShell);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri || isMac) return;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().isMaximized().then(setIsMaximized);
    });
  }, [isTauri, isMac]);

  if (!isTauri) {
    return null;
  }

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const max = await win.isMaximized();
    if (max) {
      win.unmaximize();
      setIsMaximized(false);
    } else {
      win.maximize();
      setIsMaximized(true);
    }
  };

  const handleClose = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().close();
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={[styles.dragRegion, isMac && styles.dragRegionMac]} {...({ dataSet: { tauriDragRegion: true } } as any)}>
        <Image source={require('../../../assets/images/icon_nobg.png')} style={[styles.icon, isMac && styles.iconMac, { pointerEvents: 'none' } as any]} />
      </View>
      {!isMac && (
        <View style={styles.controls}>
          <Pressable 
            style={({ pressed, hovered }: any) => [styles.button, hovered && styles.buttonHovered, pressed && styles.buttonPressed]} 
            onPress={handleMinimize}>
            {({ pressed, hovered }: any) => (
              <Svg width="12" height="12" viewBox="0 0 10 10">
                <Line x1="1" y1="5" x2="9" y2="5" stroke={Colors.textSecondary} strokeWidth="1" />
              </Svg>
            )}
          </Pressable>
          <Pressable 
            style={({ pressed, hovered }: any) => [styles.button, hovered && styles.buttonHovered, pressed && styles.buttonPressed]} 
            onPress={handleMaximize}>
            {({ pressed, hovered }: any) => (
              <Svg width="12" height="12" viewBox="0 0 10 10">
                {isMaximized ? (
                  <>
                    <Rect x="2.5" y="1.5" width="6" height="6" stroke={Colors.textSecondary} strokeWidth="1" fill="none" />
                    <Path d="M 1.5 3.5 V 8.5 H 6.5" stroke={Colors.textSecondary} strokeWidth="1" fill="none" />
                  </>
                ) : (
                  <Rect x="1.5" y="1.5" width="7" height="7" stroke={Colors.textSecondary} strokeWidth="1" fill="none" />
                )}
              </Svg>
            )}
          </Pressable>
          <Pressable 
            style={({ pressed, hovered }: any) => [styles.button, hovered && styles.closeButtonHovered, pressed && styles.closeButtonPressed]} 
            onPress={handleClose}>
            {({ pressed, hovered }: any) => (
              <Svg width="12" height="12" viewBox="0 0 10 10">
                <Path d="M 1 1 L 9 9 M 9 1 L 1 9" stroke={(hovered || pressed) ? Colors.surface : Colors.textSecondary} strokeWidth="1" />
              </Svg>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 9999,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  dragRegion: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
  dragRegionMac: {
    justifyContent: 'flex-end',
    paddingLeft: 0,
    paddingRight: 12,
  },
  icon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  iconMac: {
    marginRight: 0,
  },
  title: {
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    fontFamily: Fonts.body,
  },
  controls: {
    flexDirection: 'row',
    height: '100%',
  },
  button: {
    width: 46,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonHovered: {
    backgroundColor: Colors.surfaceCode,
  },
  buttonPressed: {
    backgroundColor: Colors.textMuted,
  },
  closeButtonHovered: {
    backgroundColor: Colors.windowClose,
  },
  closeButtonPressed: {
    backgroundColor: Colors.windowClosePressed,
  },
  controlIcon: {
    width: 12,
    height: 12,
    tintColor: Colors.textSecondary,
  },
  closeControlIconActive: {
    tintColor: Colors.surface,
  },
});
