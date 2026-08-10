// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    //ignore generated build outputs
    ignores: [
      "dist/*",
      "src-tauri/target/**",
      "android/**",
      "ios/**",
      ".expo/**",
      "src/components/ui/katexAssets.ts",
    ],
  },
  {
    //node-only scripts need these globals
    files: ["scripts/**/*.js", "plugins/**/*.js", "*.config.js"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "writable",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
      },
    },
  },
]);
