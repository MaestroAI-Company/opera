import { useWindowDimensions, Platform } from 'react-native';

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  //mobile breakpoint
  const isMobile = width < 768;

  //desktop requires web or desktop os with wide screen
  const isRealDesktopOrWeb = Platform.OS === 'web' || Platform.OS === 'windows' || Platform.OS === 'macos';
  const isDesktop = width >= 1024 && isRealDesktopOrWeb;

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
