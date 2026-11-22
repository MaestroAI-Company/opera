import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { DeviceEventEmitter, Platform } from "react-native";
import { AppEvents } from "./events";
import { BROWSER_UA } from "./net/userAgent";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
};

//mime from data uri or extension
function detectMime(uri: string): string {
  const data = uri.match(/^data:([^;,]+)/);
  if (data) return data[1];
  const ext = uri.split(/[?#]/)[0].match(/\.(\w{2,5})$/)?.[1]?.toLowerCase();
  return (ext && MIME_BY_EXT[ext]) || "image/png";
}

function buildFilename(uri: string, mime: string): string {
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const last = uri.startsWith("data:") ? "" : decodeURIComponent(uri.split(/[?#]/)[0].split("/").pop() ?? "");
  //keep a real image file name
  if (/^[\w\-. ]+\.(png|jpe?g|webp|gif|avif)$/i.test(last)) return last;
  return `opera-image-${Date.now()}.${ext}`;
}

//local file holding the image bytes
async function toLocalFile(uri: string, filename: string): Promise<string> {
  if (uri.startsWith("file://")) return uri;
  const target = `${FileSystem.cacheDirectory}${filename}`;
  if (uri.startsWith("data:")) {
    await FileSystem.writeAsStringAsync(target, uri.slice(uri.indexOf(",") + 1), { encoding: FileSystem.EncodingType.Base64 });
    return target;
  }
  //hosts reject the default agent
  const result = await FileSystem.downloadAsync(uri, target, { headers: { "User-Agent": BROWSER_UA } });
  if (result.status >= 400) throw new Error(`download failed with status ${result.status}`);
  return result.uri;
}

//false when the user cancels
export async function downloadImage(uri: string): Promise<boolean> {
  const mime = detectMime(uri);
  const filename = buildFilename(uri, mime);

  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    DeviceEventEmitter.emit(AppEvents.codeDownloaded, filename);
    return true;
  }

  if (Platform.OS === "android") {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return false;
    const local = await toLocalFile(uri, filename);
    const base64 = await FileSystem.readAsStringAsync(local, { encoding: FileSystem.EncodingType.Base64 });
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, filename, mime);
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    DeviceEventEmitter.emit(AppEvents.codeDownloaded, filename);
    return true;
  }

  const local = await toLocalFile(uri, filename);
  //share sheet already confirms
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(local, { mimeType: mime, dialogTitle: filename });
  return true;
}
