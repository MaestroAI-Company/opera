//personal apple teams cannot sign these entitlements
module.exports = ({ config }) => {
  if (process.env.IOS_PERSONAL_TEAM) {
    delete config.ios.entitlements["com.apple.developer.kernel.extended-virtual-addressing"];
    //share extension needs an app group
    const shareIntent = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-share-intent");
    shareIntent[1].disableIOS = true;
  }
  return config;
};
