import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { PIN_LENGTH } from "./pin";
import { colors, styles } from "./theme";

// A number pad the size of a thumb, with four dots that fill as you type.
//
// Its own keypad rather than the system keyboard: the system keyboard covers
// half the screen, offers letters, and on some Android builds offers to
// remember what was typed — none of which a PIN wants.

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function PinPad({
  title,
  subtitle,
  error,
  onComplete,
  deleteLabel = "Delete",
  footer,
}: {
  title: string;
  subtitle?: string | null;
  error?: string | null;
  /** Called with all four digits. Resolve to clear the dots for another go. */
  onComplete: (pin: string) => Promise<void> | void;
  deleteLabel?: string;
  footer?: React.ReactNode;
}) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);

  async function press(key: string) {
    if (busy) return;
    if (key === "⌫") return setDigits((d) => d.slice(0, -1));
    if (!key) return;
    const next = (digits + key).slice(0, PIN_LENGTH);
    setDigits(next);
    if (next.length === PIN_LENGTH) {
      setBusy(true);
      try {
        await onComplete(next);
      } finally {
        setDigits("");
        setBusy(false);
      }
    }
  }

  return (
    <View style={{ alignItems: "center", gap: 18, width: "100%" }}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>A</Text>
      </View>
      <View style={{ alignItems: "center", gap: 6, paddingHorizontal: 12 }}>
        <Text style={[styles.h1, { textAlign: "center" }]}>{title}</Text>
        {subtitle ? <Text style={[styles.muted, { textAlign: "center" }]}>{subtitle}</Text> : null}
      </View>

      <View
        style={{ flexDirection: "row", gap: 16, marginVertical: 6 }}
        accessibilityLabel={`${digits.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.pinDot, i < digits.length ? styles.pinDotOn : null, error ? { borderColor: colors.critical } : null]} />
        ))}
      </View>

      <View style={{ minHeight: 22 }}>
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={[styles.body, { color: colors.critical, textAlign: "center" }]}>{error}</Text>
        ) : null}
      </View>

      <View style={styles.pinGrid}>
        {KEYS.map((key, i) =>
          key ? (
            <Pressable
              key={i}
              onPress={() => void press(key)}
              style={({ pressed }) => [styles.pinKey, pressed ? styles.pinKeyPressed : null]}
              accessibilityRole="button"
              accessibilityLabel={key === "⌫" ? deleteLabel : key}
            >
              <Text style={[styles.pinKeyText, key === "⌫" ? { fontSize: 22 } : null]}>{key}</Text>
            </Pressable>
          ) : (
            <View key={i} style={[styles.pinKey, { backgroundColor: "transparent", borderWidth: 0 }]} />
          ),
        )}
      </View>

      {footer}
    </View>
  );
}
