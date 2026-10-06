//design tokens for the opera design system
export const LightColors = {
  //brand
  primary: "#FF1A1A",
  //pressed state goes lighter
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

  //errors
  error: "#FF4444",

  //code
  codeBlockBg: "#1E1E1E",
  codeBlockText: "#D4D4D4",
  codeInlineText: "#D63384",

  //incognito
  incognito: "#565A75",
  incognitoPressed: "#3E4157",
  //pressed state goes lighter
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
  //same rgb as background
  backgroundFade: "rgba(253,248,241,0.9)",
  backgroundClear: "rgba(253,248,241,0)",
  groupedBackground: "#FAF9F6",
  groupedBackgroundFade: "rgba(250,249,246,0.9)",
  groupedBackgroundClear: "rgba(250,249,246,0)",
  whiteFaint: "rgba(255,255,255,0.2)",
  whiteDim: "rgba(255,255,255,0.4)",
  whiteSoft: "rgba(255,255,255,0.6)",
  primarySelection: "rgba(255,26,26,0.4)",
  primaryHeader: "rgba(255,26,26,0.07)",
  incognitoSelection: "rgba(86,90,117,0.4)",
  incognitoStripe: "rgba(86,90,117,0.1)",

  //selection overlay
  selectionDim: "rgba(0,0,0,0.35)",
  selectionFill: "rgba(255,255,255,0.08)",
  selectionOutline: "#FFFFFF",
  overlayHalo: "rgba(255,26,26,0.45)",
  overlayHaloClear: "rgba(255,26,26,0)",

  //response overlay dark surface
  responseSurface: "#101014",
  responseText: "#F4F4F5",
  responseTextStrong: "#FFFFFF",
  responseTextMuted: "rgba(255,255,255,0.62)",
  responseBorder: "rgba(255,255,255,0.14)",

  //white tint lifts a red row to primaryBright
  overlayHover: "rgba(255,255,255,0.22)",
  //snackbar stays a dark pill in both themes
  snackbarBg: "#444444",
  //logo tiles stay white in both themes
  logoTile: "#FFFFFF",
  logoTileBorder: "#0000001A",
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

  //code blocks must stay recessed against the dark canvas
  codeBlockBg: "#101010",
  codeInlineText: "#FF7AB6",

  //tints flip to white, scrims stay black
  overlayFaint: "rgba(255,255,255,0.03)",
  overlaySubtle: "rgba(255,255,255,0.06)",
  snackbarBg: "#3A3A3A",
  scrimDrawer: "rgba(0,0,0,0.5)",
  scrimModal: "rgba(0,0,0,0.6)",
  backgroundFade: "rgba(23,23,21,0.9)",
  backgroundClear: "rgba(23,23,21,0)",
  groupedBackground: "#141312",
  groupedBackgroundFade: "rgba(20,19,18,0.9)",
  groupedBackgroundClear: "rgba(20,19,18,0)",
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
  displayLg: 36,
  displayMd: 26,
  displaySm: 22,
  //ui chrome (mono)
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
  md: 16,
  lg: 18,
  xl: 19,
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
  window: 15,
  huge: 16,
  pill: 20,
  huge2: 24,
} as const;

export const theme = { Colors, Fonts, FontSizes, Spacing, Radius } as const;
export default theme;
