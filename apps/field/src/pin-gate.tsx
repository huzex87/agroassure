import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { identity } from "./signer";
import { inspectorId } from "./session";
import { checkPin, hasPin, RELOCK_AFTER_MS, signOutKeepingWork } from "./pin";
import { PinPad } from "./pin-pad";
import { useLanguage } from "./i18n";
import { colors, styles } from "./theme";

// The PIN, drawn over the app rather than instead of it.
//
// Over, so that an inspector half-way through a checklist who puts the phone
// in a pocket for ten minutes comes back to the same checkpoint once they have
// unlocked — the screen underneath never unmounts. It appears when the app
// starts, and when it returns to the foreground after five minutes away.
//
// A PIN is optional. A phone without one opens straight to the app; the PIN is
// offered after setup and can be added from Account at any time.

type Gate =
  | { kind: "open" }
  | { kind: "locked"; error: string | null }
  | { kind: "forgot" }
  | { kind: "lockedOut" };

async function signedIn(): Promise<boolean> {
  const [id, who] = await Promise.all([identity(), inspectorId()]);
  return Boolean(id.deviceId && who);
}

export function PinGate() {
  const { t } = useLanguage();
  const [gate, setGate] = useState<Gate>({ kind: "open" });
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!(await signedIn())) return;
      if (await hasPin()) setGate({ kind: "locked", error: null });
    })().catch(() => undefined);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        leftAt.current ??= Date.now();
        return;
      }
      if (state !== "active") return;
      const away = leftAt.current === null ? 0 : Date.now() - leftAt.current;
      leftAt.current = null;
      if (away < RELOCK_AFTER_MS) return;
      void (async () => {
        if ((await signedIn()) && (await hasPin())) {
          setGate((g) => (g.kind === "open" ? { kind: "locked", error: null } : g));
        }
      })();
    });
    return () => sub.remove();
  }, []);

  if (gate.kind === "open") return null;

  function toActivation() {
    setGate({ kind: "open" });
    router.replace("/activate");
  }

  let body: React.ReactNode;
  if (gate.kind === "locked") {
    body = (
      <PinPad
        title={t("enterPin")}
        error={gate.error}
        deleteLabel={t("deletePin")}
        onComplete={async (pin) => {
          const result = await checkPin(pin);
          if (result.ok) return setGate({ kind: "open" });
          if (result.triesLeft === 0) {
            await signOutKeepingWork();
            return setGate({ kind: "lockedOut" });
          }
          setGate({ kind: "locked", error: `${t("wrongPin")} ${result.triesLeft}` });
        }}
        footer={
          <Pressable onPress={() => setGate({ kind: "forgot" })} accessibilityRole="button" style={{ padding: 10 }}>
            <Text style={[styles.actionText, { textAlign: "center" }]}>{t("forgotPin")}</Text>
          </Pressable>
        }
      />
    );
  } else {
    const forgot = gate.kind === "forgot";
    body = (
      <View style={{ width: "100%", gap: 16 }}>
        <View style={[styles.card, { alignItems: "center", paddingVertical: 24, gap: 10 }]}>
          <Text style={[styles.h1, { textAlign: "center" }]}>{forgot ? t("forgotPin") : t("enterPin")}</Text>
          <Text style={[styles.body, { textAlign: "center", color: forgot ? colors.inkMuted : colors.critical }]}>
            {forgot ? t("forgotPinBody") : t("lockedOut")}
          </Text>
        </View>
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          onPress={async () => {
            if (forgot) await signOutKeepingWork();
            toActivation();
          }}
        >
          <Text style={styles.buttonText}>{forgot ? t("signOutAndReset") : t("enterNewCode")}</Text>
        </Pressable>
        {forgot ? (
          <Pressable
            style={[styles.button, styles.buttonQuiet]}
            accessibilityRole="button"
            onPress={() => setGate({ kind: "locked", error: null })}
          >
            <Text style={[styles.buttonText, styles.buttonQuietText]}>{t("cancel")}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={[StyleSheet.absoluteFill, styles.screen, { zIndex: 100, justifyContent: "center" }]}>
      <View style={[styles.content, { alignItems: "center" }]}>{body}</View>
    </SafeAreaView>
  );
}
