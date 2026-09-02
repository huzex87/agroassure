// babel-preset-expo carries the React Native and Flow transforms. The app is
// bundled by Metro, which supplies this itself, so this file exists for Jest.
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
