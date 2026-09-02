// jest-expo carries the React Native transform and the Expo module mocks, which
// is the whole reason these tests run on a laptop: the screens import
// expo-camera and expo-sqlite at module load, and without the preset that is an
// immediate crash rather than a test.
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  testMatch: ["<rootDir>/test/**/*.test.tsx"],
  // The stock pattern assumes a flat node_modules. pnpm stores every package
  // under .pnpm/<name>@<version>/, so the preset's allowlist never matches and
  // React Native's own Flow-typed sources go untransformed. This transforms
  // anything under .pnpm belonging to React Native or Expo.
  transformIgnorePatterns: [
    "node_modules/\.pnpm/(?!.*(react-native|@react-native|expo|@expo|@testing-library|@noble))",
  ],
};
