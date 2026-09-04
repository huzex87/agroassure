import { StyleSheet } from "react-native";

// Huzex Light, on a phone held in a warehouse. Touch targets are generous
// because this is used standing up, one-handed, sometimes in gloves; contrast
// is high because it is used in daylight and in a dim store.

export const colors = {
  primary: "#409EF2",
  primaryDark: "#2B86D8",
  primaryTint: "#EAF4FE",
  ink: "#072435",
  inkMuted: "#4A6B7C",
  line: "#E6EEF4",
  surface: "#FFFFFF",
  canvas: "#F7FAFC",
  warn: "#B4560F",
};

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
  },

  h1: { fontSize: 22, fontWeight: "700", color: colors.ink },
  h2: { fontSize: 17, fontWeight: "600", color: colors.ink },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  mono: { fontFamily: "monospace", fontSize: 12, color: colors.ink },

  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  buttonQuiet: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonQuietText: { color: colors.ink },

  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },

  // The three responses, and only three. Each is a large target because a
  // mis-tap on a compliance record is not a small thing.
  responseRow: { flexDirection: "row", gap: 8 },
  responseButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  responseSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  responseText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  responseTextSelected: { color: "#fff" },

  banner: {
    backgroundColor: colors.primaryTint,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },

  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primaryTint,
  },
  pillText: { fontSize: 12, fontWeight: "600", color: colors.primaryDark },

  // A header that does not scroll away. On a forty-checkpoint instrument the
  // running figure is the only thing telling an inspector where they are, and
  // it was disappearing the moment they started answering.
  stickyHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: colors.primary },

  // An answered checkpoint recedes: the eye should land on what is still
  // outstanding, not re-read what is already settled.
  cardAnswered: { backgroundColor: colors.canvas, borderColor: colors.line },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  buttonDisabled: { opacity: 0.4 },

  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
});
