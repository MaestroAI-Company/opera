const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withNotifeeRepo(config) {
  return withProjectBuildGradle(config, async (config) => {
    if (config.modResults.language === 'groovy') {
      const mavenUrl = `maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;
      if (!config.modResults.contents.includes(mavenUrl)) {
        config.modResults.contents = config.modResults.contents.replace(
          /maven\s*\{\s*url\s*'https:\/\/www\.jitpack\.io'\s*\}/,
          `maven { url 'https://www.jitpack.io' }\n        ${mavenUrl}`
        );
      }
    }
    return config;
  });
};
