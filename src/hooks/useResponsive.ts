import { useWindowDimensions, Platform, NativeModules } from 'react-native';

const windowMode = Platform.OS === 'android' ? NativeModules.WindowModeModule : undefined;
const isPcDevice: boolean = windowMode?.isPcDevice ?? false;
let lastSize = '';
let lastDesktopWindow = false;

//one native read per window size
function isDesktopWindow(width: number, height: number) {
  const size = `${width}x${height}`;
  if (size !== lastSize) {
    lastSize = size;
    lastDesktopWindow = windowMode?.isDesktopWindow() ?? false;
  }
  return lastDesktopWindow;
}

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  //mobile breakpoint
  const isMobile = width < 768;

  //desktop requires web or desktop os with wide screen
  const isRealDesktopOrWeb = Platform.OS === 'web' || Platform.OS === 'windows' || Platform.OS === 'macos';
  //android pcs and desktop windows
  const isDesktop = width >= 1024 && (isRealDesktopOrWeb || isPcDevice || isDesktopWindow(width, height));

  const isTablet = width >= 768 && !isDesktop;

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    //tablet or desktop
    isLargeScreen: isTablet || isDesktop,
  };
}
