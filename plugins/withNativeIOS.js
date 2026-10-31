const { withPodfile } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const HUB_REPO_DIR = path.resolve(process.env.SAMPLER_HUB_DIR ?? path.join(__dirname, '..', '..', 'Sampler-Hub'));
const IOS_TARGETS = ['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios'];
//pinned ios release or local source build
const HAS_HUB_CLIENT = (() => {
  const pinPath = path.resolve(__dirname, '..', 'sampler-hub-client.json');
  const pin = fs.existsSync(pinPath) ? JSON.parse(fs.readFileSync(pinPath, 'utf-8')) : null;
  if (pin?.sha256?.['sampler-hub-client-ios.xcframework.zip']) return true;
  const hasRepo = fs.existsSync(path.join(HUB_REPO_DIR, 'Cargo.toml'));
  const installed = hasRepo ? spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8' }).stdout ?? '' : '';
  const canBuild = hasRepo && process.platform === 'darwin' && IOS_TARGETS.every((triple) => installed.includes(triple));
  if (!canBuild) {
    console.warn(`sampler hub disabled on ios: no pinned ios release and no buildable Sampler-Hub repo at ${HUB_REPO_DIR}`);
  }
  return canBuild;
})();

function withNativeIOS(config) {
  //pod install fetches the client like the android prebuild task
  config = withPodfile(config, (config) => {
    const contents = config.modResults.contents;
    if (!HAS_HUB_CLIENT || contents.includes("pod 'SamplerHubClient'")) return config;
    config.modResults.contents = contents.replace(
      /^(\s*use_expo_modules!.*\n)/m,
      "$1  system('node', File.join(__dir__, '..', 'scripts', 'build-hub-client.mjs'), 'ios', exception: true)\n" +
        "  pod 'SamplerHubClient', :path => '../native/ios'\n"
    );
    return config;
  });

  return config;
}

module.exports = withNativeIOS;
