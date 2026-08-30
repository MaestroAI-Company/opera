const { withAndroidManifest, withMainApplication, withDangerousMod, withAppBuildGradle, AndroidConfig } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const TEMPLATES_DIR = path.resolve(__dirname, '..', 'native', 'android');

function copyTemplate(relativeSrc, destPath, packageName) {
  const src = path.join(TEMPLATES_DIR, relativeSrc);
  let content = fs.readFileSync(src, 'utf-8');
  content = content.replace(/__PACKAGE_NAME__/g, packageName);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content, 'utf-8');
}

function withNativeAndroid(config) {
  // 1. modify manifest
  config = withAndroidManifest(config, (config) => {
    const manifestDoc = config.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifestDoc);
    application.service = application.service || [];
    application.activity = application.activity || [];

    // add/patch voice service
    const existingVoice = application.service.find(s => s.$['android:name'] === '.MaestroVoiceService');
    if (!existingVoice) {
      application.service.push({
        $: {
          'android:name': '.MaestroVoiceService',
          'android:permission': 'android.permission.BIND_VOICE_INTERACTION',
          'android:exported': 'true',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.service.voice.VoiceInteractionService' } }]
        }],
        'meta-data': [{
          $: { 'android:name': 'android.voice_interaction', 'android:resource': '@xml/voice_interaction' }
        }]
      });
    }

    // add/patch session service
    const existingSession = application.service.find(s => s.$['android:name'] === '.MaestroSessionService');
    if (!existingSession) {
      application.service.push({
        $: {
          'android:name': '.MaestroSessionService',
          'android:permission': 'android.permission.BIND_VOICE_INTERACTION',
          'android:exported': 'true',
        },
        'intent-filter': [{
          action: [
            { $: { 'android:name': 'android.service.voice.VoiceInteractionSessionService' } },
            { $: { 'android:name': 'android.service.voice.VoiceInteractionService' } }
          ]
        }]
      });
    } else {
      delete existingSession.$['android:process'];
    }

    // add recognition service
    if (!application.service.some(s => s.$['android:name'] === '.MaestroRecognitionService')) {
      application.service.push({
        $: {
          'android:name': '.MaestroRecognitionService',
          'android:permission': 'android.permission.BIND_RECOGNITION_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.speech.RecognitionService' } }]
        }],
        'meta-data': [{
          $: { 'android:name': 'android.speech', 'android:resource': '@xml/recognition_service' }
        }]
      });
    }

    // add overlay activity
    if (!application.activity.some(a => a.$['android:name'] === '.OverlayActivity')) {
      application.activity.push({
        $: {
          'android:name': '.OverlayActivity',
          'android:configChanges': 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode',
          'android:launchMode': 'singleInstance',
          'android:taskAffinity': '',
          'android:excludeFromRecents': 'true',
          'android:theme': '@style/Theme.OverlayTranslucent',
          'android:exported': 'true',
          'android:screenOrientation': 'portrait',
          'android:windowSoftInputMode': 'adjustNothing',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VOICE_ASSIST' } }],
            category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
          },
          {
            action: [{ $: { 'android:name': 'android.intent.action.ASSIST' } }],
            category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
          }
        ]
      });
    }

    //expose app settings to the system
    if (!application.activity.some(a => a.$['android:name'] === '.SettingsActivity')) {
      application.activity.push({
        $: {
          'android:name': '.SettingsActivity',
          'android:exported': 'true',
          'android:theme': '@style/Theme.OverlayTranslucent',
          'android:excludeFromRecents': 'true',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.intent.action.APPLICATION_PREFERENCES' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
        }]
      });
    }

    return config;
  });

  // 2. write native files from templates
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const packageName = config.android?.package || 'com.anonymous.maestroopera';
      const packagePath = packageName.replace(/\./g, '/');

      const xmlDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml');
      const valuesDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'values');
      const javaDir = path.join(projectRoot, 'app', 'src', 'main', 'java', packagePath);

      // copy XML resources
      copyTemplate('res/xml/voice_interaction.xml', path.join(xmlDir, 'voice_interaction.xml'), packageName);
      copyTemplate('res/xml/recognition_service.xml', path.join(xmlDir, 'recognition_service.xml'), packageName);

      // copy themes
      const themesPath = path.join(valuesDir, 'themes.xml');
      copyTemplate('res/values/themes.xml', themesPath, packageName);

      // copy Java sources
      copyTemplate('src/MaestroVoiceService.java', path.join(javaDir, 'MaestroVoiceService.java'), packageName);
      copyTemplate('src/MaestroSessionService.java', path.join(javaDir, 'MaestroSessionService.java'), packageName);
      copyTemplate('src/MaestroSession.java', path.join(javaDir, 'MaestroSession.java'), packageName);
      copyTemplate('src/MaestroRecognitionService.java', path.join(javaDir, 'MaestroRecognitionService.java'), packageName);
      copyTemplate('src/OverlayActivity.java', path.join(javaDir, 'OverlayActivity.java'), packageName);
      copyTemplate('src/SettingsActivity.java', path.join(javaDir, 'SettingsActivity.java'), packageName);

      // copy Kotlin sources
      copyTemplate('src/ScreenshotHolder.kt', path.join(javaDir, 'ScreenshotHolder.kt'), packageName);
      copyTemplate('src/ScreenCaptureModule.kt', path.join(javaDir, 'ScreenCaptureModule.kt'), packageName);
      copyTemplate('src/TextSelectionLayer.kt', path.join(javaDir, 'TextSelectionLayer.kt'), packageName);
      copyTemplate('src/MaestroOverlayPackage.kt', path.join(javaDir, 'MaestroOverlayPackage.kt'), packageName);
      copyTemplate('src/AssistantModule.kt', path.join(javaDir, 'AssistantModule.kt'), packageName);

      // AICore (ML Kit GenAI) modules
      copyTemplate('src/AICorePackage.kt', path.join(javaDir, 'AICorePackage.kt'), packageName);
      copyTemplate('src/AICoreModule.kt', path.join(javaDir, 'AICoreModule.kt'), packageName);
      // useless modules removed

      // patch AndroidManifest: config plugin serializer drops taskAffinity=""
      const manifestPath = path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
      if (fs.existsSync(manifestPath)) {
        let manifest = fs.readFileSync(manifestPath, 'utf-8');
        const overlayName = '.OverlayActivity';
        if (manifest.includes(`android:name="${overlayName}"`) && !manifest.includes('android:taskAffinity')) {
          const tagRegex = new RegExp(`<activity[^>]*android:name="\\${overlayName}"[^>]*>`);
          const tagMatch = manifest.match(tagRegex);
          if (tagMatch && !tagMatch[0].includes('taskAffinity')) {
            const newTag = tagMatch[0].replace('>', ' android:taskAffinity="" android:windowSoftInputMode="adjustNothing">');
            manifest = manifest.replace(tagMatch[0], newTag);
            fs.writeFileSync(manifestPath, manifest, 'utf-8');
          }
        }
      }

      return config;
    }
  ]);

  // 3. register native packages in MainApplication
  config = withMainApplication(config, (config) => {
    const packageName = config.android?.package || 'com.anonymous.maestroopera';
    let { contents } = config.modResults;
    const isKotlin = contents.includes('.packages.apply');

    const packagesToRegister = ['AICorePackage', 'MaestroOverlayPackage'];

    for (const pkg of packagesToRegister) {
      const importLine = `import ${packageName}.${pkg}${isKotlin ? '' : ';'}`;
      if (!contents.includes(importLine)) {
        const lastImport = contents.lastIndexOf('import ');
        const endOfLine = contents.indexOf('\n', lastImport);
        contents = contents.slice(0, endOfLine + 1) + importLine + '\n' + contents.slice(endOfLine + 1);
      }
    }

    if (isKotlin) {
      const marker = '// Packages that cannot be autolinked yet can be added manually here, for example:';
      for (const pkg of packagesToRegister) {
        const addLine = `        add(${pkg}())`;
        if (!contents.includes(addLine)) {
          contents = contents.replace(marker, marker + '\n' + addLine);
        }
      }
    } else {
      for (const pkg of packagesToRegister) {
        const addLine = `      packages.add(new ${pkg}());`;
        if (!contents.includes(addLine)) {
          contents = contents.replace('return packages;', addLine + '\n          return packages;');
        }
      }
    }

    config.modResults.contents = contents;
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    //mlkit compiled with newer kotlin, skip version check
    if (!contents.includes('Xskip-metadata-version-check')) {
      const anchor = "    namespace 'ai.maestro.opera'";
      contents = contents.replace(
        anchor,
        anchor + '\n\n' +
        '    //mlkit compiled with newer kotlin, skip version check\n' +
        '    kotlinOptions {\n' +
        '        freeCompilerArgs += "-Xskip-metadata-version-check"\n' +
        '    }'
      );
    }
    const mlkit = [
      'com.google.mlkit:genai-prompt:1.0.0-beta4',
      'com.google.mlkit:genai-speech-recognition:1.0.0-alpha1',
      //bundled models for ocr and qr
      'com.google.mlkit:text-recognition:16.0.1',
      'com.google.mlkit:barcode-scanning:17.3.0',
    ];
    const missing = mlkit.filter(dep => !contents.includes(dep.split(':').slice(0, 2).join(':')));
    if (missing.length) {
      contents = contents.replace(
        'dependencies {',
        'dependencies {\n' + missing.map(dep => `    implementation("${dep}")`).join('\n')
      );
    }
    config.modResults.contents = contents;
    return config;
  });

  //sign with upload keystore in ci else debug
  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (contents.includes('UPLOAD_STORE_FILE')) return config;

    contents = contents.replace(
      "    signingConfigs {\n        debug {\n            storeFile file('debug.keystore')\n            storePassword 'android'\n            keyAlias 'androiddebugkey'\n            keyPassword 'android'\n        }\n    }",
      "    signingConfigs {\n        debug {\n            storeFile file('debug.keystore')\n            storePassword 'android'\n            keyAlias 'androiddebugkey'\n            keyPassword 'android'\n        }\n        release {\n            def uploadStoreFile = System.getenv('UPLOAD_STORE_FILE')\n            if (uploadStoreFile) {\n                storeFile file(uploadStoreFile)\n                storePassword System.getenv('UPLOAD_STORE_PASSWORD')\n                keyAlias System.getenv('UPLOAD_KEY_ALIAS')\n                keyPassword System.getenv('UPLOAD_KEY_PASSWORD')\n            }\n        }\n    }"
    );
    contents = contents.replace(
      "        release {\n            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug",
      "        release {\n            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            //debug key without an upload keystore\n            signingConfig System.getenv('UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
    );
    config.modResults.contents = contents;
    return config;
  });

  return config;
}

module.exports = withNativeAndroid;
