const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

//disable package exports resolution (whisper.rn missing "." entry)
config.resolver.unstable_enablePackageExports = false;

//shim react-native-webview to iframe on web (no web support in v13)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react-native-webview" && platform === "web") {
    return {
      filePath: path.resolve(__dirname, "src/components/ui/WebView.web.tsx"),
      type: "sourceFile",
    };
  }
  //expo-quick-actions exports map disabled for whisper.rn
  if (moduleName === "expo-quick-actions" || moduleName === "expo-quick-actions/hooks") {
    const buildDir = path.resolve(__dirname, "node_modules/expo-quick-actions/build");
    const file =
      moduleName === "expo-quick-actions"
        ? platform === "web"
          ? "index.web.js"
          : "index.js"
        : "hooks.js";
    return {
      filePath: path.join(buildDir, file),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

//add .bin extension for whisper model bundling and .wasm for expo-sqlite web
config.resolver.assetExts.push("bin", "wasm");

//polyfill for node core module "buffer" (used by safe-buffer in whisper.rn)
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve("buffer"),
};

// ignore tauri build files
config.resolver.blockList = [
  /[\\/]src-tauri[\\/]/,
].concat(config.resolver.blockList || []);

module.exports = config;
