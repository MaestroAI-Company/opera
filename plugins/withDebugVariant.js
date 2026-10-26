const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

//dev builds install beside the play store build
const APP_ID_SUFFIX = '.dev';
const APP_NAME = 'Opera Dev';
const ICON_BACKGROUND = '#3B82F6';

const ADAPTIVE_ICON = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/iconBackgroundDebug"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function withDebugVariant(config) {
  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    const debugAnchor = '        debug {\n            signingConfig signingConfigs.debug\n';
    if (!contents.includes(debugAnchor + '            applicationIdSuffix')) {
      contents = contents.replace(debugAnchor, debugAnchor + `            applicationIdSuffix "${APP_ID_SUFFIX}"\n`);
    }
    //release copy sharing the dev slot and its data
    if (!contents.includes('        preview {')) {
      const releaseEnd = '            crunchPngs enablePngCrunchInRelease.toBoolean()\n        }\n';
      contents = contents.replace(
        releaseEnd,
        releaseEnd +
        '        preview {\n' +
        '            initWith release\n' +
        `            applicationIdSuffix "${APP_ID_SUFFIX}"\n` +
        '            signingConfig signingConfigs.debug\n' +
        "            matchingFallbacks = ['release']\n" +
        '        }\n'
      );
    }
    config.modResults.contents = contents;
    return config;
  });

  //build type source sets override main resources
  config = withDangerousMod(config, [
    'android',
    (config) => {
      for (const buildType of ['debug', 'preview']) {
        const resDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', buildType, 'res');
        writeFile(
          path.join(resDir, 'values', 'strings.xml'),
          `<resources>\n  <string name="app_name">${APP_NAME}</string>\n</resources>\n`
        );
        writeFile(
          path.join(resDir, 'values', 'colors.xml'),
          `<resources>\n  <color name="iconBackgroundDebug">${ICON_BACKGROUND}</color>\n</resources>\n`
        );
        writeFile(path.join(resDir, 'mipmap-anydpi-v26', 'ic_launcher.xml'), ADAPTIVE_ICON);
        writeFile(path.join(resDir, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), ADAPTIVE_ICON);
      }
      return config;
    },
  ]);

  return config;
}

module.exports = withDebugVariant;
