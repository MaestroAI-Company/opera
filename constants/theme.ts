//design tokens for the opera design system
export const LightColors = {
  //brand
  primary: "#FF1A1A",
  primaryPressed: "#D61515",
  primaryActive: "#CC1414",
  primaryBright: "#FF4D4D",

  //canvas & surfaces
  background: "#FDF8F1",
  surface: "#FFFFFF",
  surfaceMuted: "#F9F9F9",
  surfaceSubtle: "#F5F5F5",
  surfacePressed: "#EAEAEA",
  surfaceCode: "#F0F0F0",

  //borders & outlines
  border: "#0000000D",
  borderOnPrimary: "#FFFFFF52",
  shadowInk: "#00000013",

  //text ramp
  textPrimary: "#000000",
  textSecondary: "#444444",
  textMuted: "#888888",
  textOnPrimary: "#FFFFFF",

  //links & errors
  link: "#3B82F6",
  linkAlt: "#0066CC",
  error: "#FF4444",
  dangerBorder: "#FF1A1A22",
  dangerBg: "#FFF0F0",
  dangerBgSoft: "#FFF5F5",
  dangerBorderSoft: "#FFCCCC",

  //code
  codeBlockBg: "#1E1E1E",
  codeBlockText: "#D4D4D4",
  codeInlineText: "#D63384",

  //incognito
  incognito: "#565A75",
  incognitoPressed: "#3E4157",
  incognitoBright: "#70748E",
  incognitoSurface: "#2A2A35",

  //window chrome
  windowClose: "#E81123",
  windowClosePressed: "#F1707A",

  //overlays, scrims & tints
  overlayFaint: "rgba(0,0,0,0.03)",
  overlaySubtle: "rgba(0,0,0,0.05)",
  overlay: "rgba(0,0,0,0.15)",
  scrimDrawer: "rgba(0,0,0,0.25)",
  overlayStrong: "rgba(0,0,0,0.3)",
  scrimModal: "rgba(0,0,0,0.4)",
  backgroundFade: "rgba(255,245,236,0.9)",
  backgroundClear: "rgba(255,245,236,0)",
  surfaceFade: "rgba(255,255,255,0.9)",
  surfaceClear: "rgba(255,255,255,0)",
  groupedBackground: "#FAF9F6",
  groupedBackgroundFade: "rgba(250,249,246,0.9)",
  groupedBackgroundClear: "rgba(250,249,246,0)",
  whiteFaint: "rgba(255,255,255,0.2)",
  whiteDim: "rgba(255,255,255,0.4)",
  whiteSoft: "rgba(255,255,255,0.6)",
  primarySelection: "rgba(255,26,26,0.4)",
  primaryHeader: "rgba(255,26,26,0.07)",
  incognitoSelection: "rgba(86,90,117,0.4)",
  incognitoHeader: "rgba(86,90,117,0.25)",
  incognitoStripe: "rgba(86,90,117,0.1)",

  //selection overlay
  selectionFullFill: "rgba(255,255,255,0.07)",
  selectionDim: "rgba(0,0,0,0.35)",
  selectionFill: "rgba(255,255,255,0.08)",
  selectionOutline: "#FFFFFF",
  selectionHandle: "#FFFFFF",
  overlayHalo: "rgba(255,26,26,0.45)",
  overlayHaloClear: "rgba(255,26,26,0)",

  //response overlay dark gradient
  responseSurface: "#101014",
  responseGradientTop: "rgba(24,24,30,0.92)",
  responseGradientBottom: "rgba(2,2,4,0.98)",
  responseText: "#F4F4F5",
  responseTextStrong: "#FFFFFF",
  responseTextMuted: "rgba(255,255,255,0.62)",
  responseLink: "#7CB3FF",
  responseBorder: "rgba(255,255,255,0.14)",

  //hover tint on ghost icon buttons
  overlayHover: "rgba(0,0,0,0.15)",
  //snackbar stays a dark pill in both themes
  snackbarBg: "#444444",
  //logo tiles stay white in both themes
  logoTile: "#FFFFFF",
  logoTileBorder: "#0000001A",
  //screensaver stays pure black for oled
  screensaverBackground: "#000000",
} as const;

//every palette carries the same keys, values stay free-form color strings
export type ThemeColors = { readonly [K in keyof typeof LightColors]: string };

//dark palette: red untouched, cream canvas and white surfaces go dark, ramps invert
export const DarkColors: ThemeColors = {
  ...LightColors,

  //canvas & surfaces
  background: "#171715",
  surface: "#252525",
  surfaceMuted: "#2A2A2A",
  surfaceSubtle: "#2F2F2F",
  surfacePressed: "#383838",
  surfaceCode: "#2F2F2F",

  //outlines stay invisible, surface contrast carries the separation
  border: "rgba(255,255,255,0.07)",
  shadowInk: "#00000080",

  //text ramp
  textPrimary: "#FFFFFF",
  textSecondary: "#C9C9C9",
  textMuted: "#8A8A8A",

  //links & errors
  link: "#7CB3FF",
  linkAlt: "#4DA3FF",
  dangerBorder: "#FF1A1A44",
  dangerBg: "#2E1E1E",
  dangerBgSoft: "#2A1D1D",
  dangerBorderSoft: "#5A2E2E",

  //code blocks must stay recessed against the dark canvas
  codeBlockBg: "#101010",
  codeInlineText: "#FF7AB6",

  //tints flip to white, scrims stay black
  overlayFaint: "rgba(255,255,255,0.03)",
  overlaySubtle: "rgba(255,255,255,0.06)",
  overlayHover: "rgba(255,255,255,0.12)",
  snackbarBg: "#3A3A3A",
  scrimDrawer: "rgba(0,0,0,0.5)",
  scrimModal: "rgba(0,0,0,0.6)",
  backgroundFade: "rgba(23,23,21,0.9)",
  backgroundClear: "rgba(23,23,21,0)",
  surfaceFade: "rgba(37,37,37,0.9)",
  surfaceClear: "rgba(37,37,37,0)",
  groupedBackground: "#141312",
  groupedBackgroundFade: "rgba(20,19,18,0.9)",
  groupedBackgroundClear: "rgba(20,19,18,0)",
  screensaverBackground: "#000000",
};

//light stays the module default so non-react code keeps working
export const Colors = LightColors;

export const Fonts = {
  display: "Petrona",
  body: "Figtree",
  mono: "FragmentMono",
} as const;

export const FontSizes = {
  //display serif
  displayHero: 48,
  displayHuge: 64,
  displayClock: 120,
  displayXl: 34,
  displayLg: 36,
  displayMd: 26,
  displaySm: 22,
  //ui chrome (mono)
  title: 17,
  label: 12,
  labelSm: 10,
  //reading (figtree)
  body: 15,
  bodyMd: 14,
  caption: 13,
  micro: 11,
  code: 13,
  //additional sizes in use
  xxs: 8,
  xs: 10,
  md: 16,
  lg: 18,
  xl: 19,
  xL: 19,
  xxxl: 32,
} as const;

export const Spacing = {
  xs2: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  lg2: 12,
  xl: 14,
  xl2: 16,
  xxl: 20,
  xxl2: 24,
  xxxl: 32,
} as const;

export const Radius = {
  xs: 2,
  xxs: 3,
  sm: 4,
  md: 5,
  lg: 6,
  xl: 8,
  xxl: 10,
  lg2: 12,
  xl2: 14,
  window: 15,
  huge: 16,
  pill: 20,
  huge2: 24,
} as const;

export const theme = { Colors, Fonts, FontSizes, Spacing, Radius } as const;
export default theme;
