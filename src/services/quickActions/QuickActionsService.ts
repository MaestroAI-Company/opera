import * as QuickActions from "expo-quick-actions";
import { Platform } from "react-native";

export const NEW_CHAT_ACTION_ID = "new-chat";

export const STATIC_ACTIONS: QuickActions.Action[] = [
  {
    id: NEW_CHAT_ACTION_ID,
    title: "New Chat",
    subtitle: "Start a new conversation",
    icon: "new_chat",
    params: { action: NEW_CHAT_ACTION_ID },
  },
];

const dynamicActions: QuickActions.Action[] = [];

export function setDynamicActions(actions: QuickActions.Action[]): void {
  dynamicActions.splice(0, dynamicActions.length, ...actions);
}

export async function setupQuickActions(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!(await QuickActions.isSupported())) return;
  //ios static actions from config plugin, android needs runtime setItems
  if (Platform.OS === "android") {
    await QuickActions.setItems([...STATIC_ACTIONS, ...dynamicActions]);
  }
}
