import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { getStore } from "../src/db";
import { forgetIdentity } from "../src/signer";
import { clearInspector, inspectorName } from "../src/session";
import { clearToken } from "../src/transport";
import { syncNow, useAutoSync } from "../src/auto-sync";
import { useLanguage, type Language } from "../src/i18n";
import { colors, styles } from "../src/theme";

// Everything about the person and the phone, in one place and out of the way.
//
// This replaces the "Device" button, which opened a screen showing a public key
// to people who had no use for one. What an inspector actually needs from here
// is short: who they are signed in as, their language, whether their work has
// gone, and a way to hand the phone to somebody else.

export default function Account() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage } = useLanguage();
  const sync = useAutoSync();

  const [name, setName] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      inspectorName().then(setName);
    }, []),
  );

  // Unsent work blocks signing out — unless the administrator already signed
  // this phone out, in which case nothing on it can be sent any more and
  // keeping the person here would only trap them.
  const signedOutRemotely = sync.phase === "signedOut";
  const unsent = sync.queued > 0 && !signedOutRemotely;

  async function signOut() {
    setBusy(true);
    try {
      // Refused while work is waiting, because the key that signed it is about
      // to be destroyed and nothing else can send it.
      if (!signedOutRemotely && getStore().pendingCount() > 0) return;
      // The visits belonged to the person leaving, not to the phone.
      getStore().replaceAssignedFacilities([]);
      await forgetIdentity();
      await clearInspector();
      await clearToken();
      router.replace("/activate");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.card}>
        <Text style={styles.overline}>{t("signedInAs")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <Text style={[styles.h2, { flexShrink: 1 }]}>{name ?? "—"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.overline}>{t("language")}</Text>
        <View style={styles.segmented}>
          {(["en", "ha"] as Language[]).map((option) => {
            const on = option === language;
            return (
              <Pressable
                key={option}
                onPress={() => setLanguage(option)}
                style={[styles.segment, on ? styles.segmentOn : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segmentText, on ? styles.segmentTextOn : null]}>
                  {option === "en" ? "English" : "Hausa"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: unsent ? colors.caution : colors.good },
              ]}
            />
            <Text style={styles.h2}>
              {unsent ? `${sync.queued} ${t("waitingToSend")}` : t("allSent")}
            </Text>
          </View>
        </View>
        <Text style={styles.muted}>{unsent ? t("savedOnPhone") : " "}</Text>
        <Pressable
          style={[styles.button, styles.buttonQuiet]}
          onPress={() => void syncNow()}
          disabled={sync.phase === "sending"}
          accessibilityRole="button"
        >
          {sync.phase === "sending" ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.buttonText, styles.buttonQuietText]}>{t("sendNow")}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        {unsent ? (
          <Text style={[styles.muted, { color: colors.caution }]}>{t("signOutUnsent")}</Text>
        ) : null}
        {confirming ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              style={[styles.button, styles.buttonQuiet, { flex: 1 }]}
              onPress={() => setConfirming(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, styles.buttonQuietText]}>{t("cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonDanger, { flex: 1 }]}
              onPress={signOut}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{t("signOutConfirm")}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.button, styles.buttonQuiet, unsent ? styles.buttonDisabled : null]}
            onPress={() => setConfirming(true)}
            disabled={unsent}
            accessibilityRole="button"
            accessibilityState={{ disabled: unsent }}
          >
            <Text style={[styles.buttonText, { color: colors.critical }]}>{t("signOut")}</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.faint, { textAlign: "center" }]}>
        AgroAssure {Constants.expoConfig?.version ?? ""}
      </Text>
    </ScrollView>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}
