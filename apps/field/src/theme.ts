import { Platform, StyleSheet } from "react-native";

// Huzex Light, on a phone held in a warehouse.
//
// The constraints here are not a desk's. Touch targets are generous because
// this is used standing up, one-handed, sometimes in gloves. Contrast is high
// because it is used in full daylight and in a dim store on the same afternoon.
// And status carries its own hue rather than a tint of the brand blue, the same
// way it does in the console: an inspector scanning eight facilities should see
// which are done without reading each one.

export const colors = {
  primary: "#2F93EC",
  primaryDark: "#1665AD",
  primaryTint: "#EAF4FE",
  primaryLine: "#C2E0FB",

  ink: "#072435",
  inkMuted: "#4A6B7C",
  inkFaint: "#7C96A4",

  line: "#E4EDF3",
  lineFirm: "#CBDAE5",
  surface: "#FFFFFF",
  surfaceSunk: "#F4F8FB",
  canvas: "#F6FAFC",

  good: "#0F7A5F",
  goodTint: "#E6F4EF",
  caution: "#A45E07",
  cautionTint: "#FDF3E5",
  critical: "#B93A2E",
  criticalTint: "#FDF0EE",

  /** The old name for caution, kept so existing screens keep compiling. */
  warn: "#A45E07",

  white: "#FFFFFF",
};

// One shadow, defined once. React Native wants different properties on each
// platform, and getting that wrong is how a card ends up flat on Android.
const raised = Platform.select({
  ios: {
    shadowColor: "#072435",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
  android: { elevation: 2 },
  default: {},
});

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
    ...raised,
  },

  // A settled card recedes: the eye should land on what is still outstanding,
  // not re-read what is already done.
  cardAnswered: {
    backgroundColor: colors.surfaceSunk,
    borderColor: colors.line,
    shadowOpacity: 0,
    elevation: 0,
  },

  // -- type ---------------------------------------------------------------
  // A scale, not a set of one-off sizes. Line heights are set on everything
  // read in sentences: the default is tight enough to hurt at arm's length in
  // bad light.
  h1: { fontSize: 24, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: "600", color: colors.ink, letterSpacing: -0.2 },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  faint: { fontSize: 12, color: colors.inkFaint, lineHeight: 17 },
  overline: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.inkFaint,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
    color: colors.ink,
  },

  // -- buttons ------------------------------------------------------------
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  buttonQuiet: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineFirm,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  buttonQuietText: { color: colors.ink },
  buttonDisabled: { opacity: 0.4 },

  input: {
    borderWidth: 1,
    borderColor: colors.lineFirm,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    // 16 and no smaller: iOS zooms the whole page when a focused field is under
    // 16px, which throws an inspector out of the layout mid-signature.
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
    minHeight: 50,
  },

  // -- the three responses ------------------------------------------------
  // Each is a large target because a mis-tap on a compliance record is not a
  // small thing, and each settles into the colour of what it means rather than
  // all three turning the same brand blue.
  responseRow: { flexDirection: "row", gap: 8 },
  responseButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  responseText: { fontSize: 16, fontWeight: "600", color: colors.inkMuted },
  responseYes: { backgroundColor: colors.goodTint, borderColor: colors.good },
  responseYesText: { color: colors.good },
  responseNo: { backgroundColor: colors.criticalTint, borderColor: colors.critical },
  responseNoText: { color: colors.critical },
  responseNa: { backgroundColor: colors.surfaceSunk, borderColor: colors.lineFirm },
  responseNaText: { color: colors.ink },

  // -- surfaces -----------------------------------------------------------
  banner: {
    backgroundColor: colors.primaryTint,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primaryLine,
    padding: 14,
    gap: 4,
  },
  bannerQuiet: {
    backgroundColor: colors.surfaceSunk,
    borderColor: colors.line,
  },

  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineFirm,
  },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.ink },

  // A status chip: dot plus word, so colour is never the only channel.
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipDot: { width: 6, height: 6, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: "600" },

  // -- the checklist header ----------------------------------------------
  // Does not scroll away. On a forty-checkpoint instrument the running figure
  // is the only thing telling an inspector where they are, and it was
  // disappearing the moment they started answering.
  stickyHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceSunk,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: colors.primary },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  // -- the card's action --------------------------------------------------
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  actionText: { fontSize: 15, fontWeight: "600", color: colors.primaryDark, flexShrink: 1 },
  actionChevron: { fontSize: 22, lineHeight: 24, color: colors.primaryDark },

  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});

/** The chip colours for a state, so every screen tints the same word the same way. */
export function chipTone(tone: "good" | "caution" | "critical" | "neutral") {
  switch (tone) {
    case "good":
      return { bg: colors.goodTint, fg: colors.good };
    case "caution":
      return { bg: colors.cautionTint, fg: colors.caution };
    case "critical":
      return { bg: colors.criticalTint, fg: colors.critical };
    default:
      return { bg: colors.surfaceSunk, fg: colors.inkMuted };
  }
}
