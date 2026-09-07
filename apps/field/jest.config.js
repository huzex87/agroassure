// jest-expo carries the React Native transform and the Expo module mocks, which
// is the whole reason these tests run on a laptop: the screens import
// expo-camera and expo-sqlite at module load, and without the preset that is an
// immediate crash rather than a test.
module.exports = {
  preset: "jest-expo",
  // Two suites, three seconds: parallelism buys nothing here and costs a flaky
  // signal. Each one boots a real SQLite engine and renders a React Native tree,
  // and under CPU contention a cold first render still outran the raised
  // asyncUtilTimeout often enough to fail the first test of a file and pass
  // every later one — which reads like a defect and is not one.
  maxWorkers: 1,
  // Jest's own per-test deadline, which is the one that was actually firing:
  // "Exceeded timeout of 5000 ms for a test". A cold React Native render over a
  // real SQLite engine can pass five seconds on a machine that is also running
  // Metro, a gateway and a database — which is precisely the machine these are
  // run on. Raising the testing library's asyncUtilTimeout did not touch this.
  testTimeout: 30_000,
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  // Deliberately relative, not "<rootDir>/test/...". Jest already scans rootDir
  // and nothing else, so anchoring buys nothing — but it interpolates an
  // absolute path into a glob, and micromatch reads a backslash as an escape.
  // Checked out anywhere with a dot directory in its path — a git worktree
  // under .claude/ is how this showed up — "agroassure\.claude" collapsed to
  // "agroassure.claude", which matches nothing, and the suite reported zero
  // tests found rather than failing. A green run over no tests is the worst
  // way to be wrong.
  testMatch: ["**/test/**/*.test.tsx"],
  // The stock pattern assumes a flat node_modules. pnpm stores every package
  // under .pnpm/<name>@<version>/, so the preset's allowlist never matches and
  // React Native's own Flow-typed sources go untransformed. This transforms
  // anything under .pnpm belonging to React Native or Expo.
  transformIgnorePatterns: [
    "node_modules/\.pnpm/(?!.*(react-native|@react-native|expo|@expo|@testing-library|@noble))",
  ],
};
