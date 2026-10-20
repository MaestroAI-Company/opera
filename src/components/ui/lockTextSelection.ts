import { Platform } from "react-native";

//block text selection page wide while a slider is dragged
export const lockTextSelection = (locked: boolean) => {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.body.style.userSelect = locked ? "none" : "";
  document.body.style.setProperty("-webkit-user-select", locked ? "none" : "");
};
