import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

//fence language to file extension
const EXTENSIONS: Record<string, string> = {
  javascript: "js", js: "js", jsx: "jsx", typescript: "ts", ts: "ts", tsx: "tsx",
  python: "py", py: "py", ruby: "rb", rb: "rb", bash: "sh", sh: "sh", shell: "sh", zsh: "sh",
  yaml: "yml", yml: "yml", json: "json", html: "html", css: "css", sql: "sql",
  c: "c", cpp: "cpp", "c++": "cpp", csharp: "cs", cs: "cs", go: "go", rust: "rs", rs: "rs",
  java: "java", kotlin: "kt", kt: "kt", swift: "swift", php: "php", markdown: "md", md: "md", xml: "xml",
};

function buildFilename(language?: string, title?: string): string {
  const lang = language?.trim().toLowerCase() ?? "";
  const ext = EXTENSIONS[lang] ?? (/^[a-z0-9]{1,5}$/.test(lang) ? lang : "txt");
  //keep titles that already are file names
  if (title && /^[\w\-. ]+\.[A-Za-z0-9]{1,5}$/.test(title)) return title;
  const base = title?.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "code";
  return `${base}.${ext}`;
}

//false when the user cancels
export async function downloadCodeFile(code: string, language?: string, title?: string): Promise<boolean> {
  const filename = buildFilename(language, title);

  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  if (Platform.OS === "android") {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return false;
    //generic mime keeps android from appending .txt
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, filename, "application/octet-stream");
    await FileSystem.writeAsStringAsync(fileUri, code, { encoding: FileSystem.EncodingType.UTF8 });
    return true;
  }

  const fileUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, code, { encoding: FileSystem.EncodingType.UTF8 });
  //sandbox hides the file from users
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri, { dialogTitle: filename });
  return true;
}
