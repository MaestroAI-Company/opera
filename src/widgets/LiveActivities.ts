import type { LiveActivityFactory } from "expo-widgets";
import type { CallActivityProps, DownloadActivityProps } from "./liveActivityProps";

//live activities exist on ios only
export const downloadActivity = null as LiveActivityFactory<DownloadActivityProps> | null;
export const callActivity = null as LiveActivityFactory<CallActivityProps> | null;
