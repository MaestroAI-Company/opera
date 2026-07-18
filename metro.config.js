const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

//disable package exports resolution (whisper.rn missing "." entry)
config.resolver.unstable_enablePackageExports = false;

//add .bin extension for whisper model bundling
config.resolver.assetExts.push("bin");

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
