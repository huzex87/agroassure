import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { forgetIdentity, generateKeypair, identity, setDeviceId } from "../src/signer";
import { inspectorId, inspectorName, setInspectorId, setInspectorName } from "../src/session";
import { activate, ApiError, registerOptions } from "../src/transport";
import { requestSync } from "../src/auto-sync";
import { FinishSetup, Welcome } from "../src/finish-setup";
import { loadTicket } from "../src/registration";
import { useLanguage } from "../src/i18n";
import { colors, styles } from "../src/theme";
import { CODE_LENGTH, cleanCode, displayCode } from "../src/invite-code";

// Setting up a phone: one code, one button.
//
// This replaces a screen that asked "who are you?", sent a request, and then
// showed a public key and a "waiting for approval" message until an
// administrator somewhere happened to click a button. The administrator's
// decision now happens earlier — sending the invite is the approval — so all
// that is left here is typing what arrived by email or SMS. Opening the link in
// that message brings the inspector here with the code already filled in.
//
// The phone still makes its own signing key and only ever sends the public
// half. Nothing about attribution has changed; only the waiting has gone.

function phoneLabel(): string {
  const model = (Platform.constants as { Model?: string }).Model;
  if (model) return model;
  return Platform.OS === "ios" ? "iPhone" : "Android phone";
}

type Step = "checking" | "enter" | "finish" | "alreadySetUp";

export default function Activate() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage } = useLanguage();
  const params = useLocalSearchParams<{ code?: string }>();

  const [step, setStep] = useState<Step>("checking");
  const [code, setCode] = useState(cleanCode(String(params.code ?? "")));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  // Asking to join is only offered when this server has it switched on. The
  // normal way in is the code, and a screen that offers two ways in asks the
  // person to choose before they know the difference.
  const [canRegister, setCanRegister] = useState(false);

  useEffect(() => {
    registerOptions()
      .then((o) => setCanRegister(o.available))
      .catch(() => setCanRegister(false));
  }, []);

  useEffect(() => {
    (async () => {
      const [id, who] = await Promise.all([identity(), inspectorId()]);
      if (id.deviceId && who) {
        setName(await inspectorName());
        setStep("alreadySetUp");
      } else if (!params.code && (await loadTicket())) {
        // A request to join is still open on this phone: go back to it.
        router.replace("/register");
      } else {
        setStep("enter");
      }
    })().catch(() => setStep("enter"));
  }, []);

  // A link opened while the app is already on this screen.
  useEffect(() => {
    if (params.code) setCode(cleanCode(String(params.code)));
  }, [params.code]);

  const complete = code.length === CODE_LENGTH;

  async function submit() {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      let result;
      try {
        result = await activate(code, await generateKeypair(), phoneLabel());
      } catch (err) {
        // The key on this phone was signed out remotely — it was lost, or
        // handed back. That decision stands; the phone starts again with a new
        // key, which the server sees as a new, separately attributable phone.
        if (err instanceof ApiError && err.reason === "device_signed_out") {
          await forgetIdentity();
          result = await activate(code, await generateKeypair(), phoneLabel());
        } else {
          throw err;
        }
      }

      await setDeviceId(result.deviceId);
      await setInspectorId(result.userId);
      await setInspectorName(result.fullName);
      setName(result.fullName);
      // A PIN before anything else; FinishSetup says why.
      setStep("finish");
      // Collect the day straight away, while the person is still looking.
      requestSync();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("cannotReach"),
      );
    } finally {
      setBusy(false);
    }
  }

  if (step === "checking") {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (step === "finish") {
    return <FinishSetup name={name} onFinish={() => router.replace("/")} />;
  }

  if (step === "alreadySetUp") {
    return <Welcome title={t("alreadySetUp")} body={t("alreadySetUpBody")} onContinue={() => router.replace("/")} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { flexGrow: 1, justifyContent: "center", gap: 20, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => setLanguage(language === "en" ? "ha" : "en")}
          style={{ alignSelf: "flex-end", padding: 6 }}
          accessibilityRole="button"
          accessibilityLabel={t("language")}
        >
          <Text style={styles.actionText}>{t("switchLanguage")}</Text>
        </Pressable>

        <View style={{ alignItems: "center", gap: 10 }}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>A</Text>
          </View>
          <Text style={[styles.h1, { textAlign: "center" }]}>{t("welcome")}</Text>
          <Text style={[styles.body, { textAlign: "center", color: colors.inkMuted }]}>
            {t("enterCode")}
          </Text>
        </View>

        <View style={[styles.card, { gap: 14 }]}>
          <Text style={styles.overline}>{t("inviteCode")}</Text>
          <Pressable onPress={() => input.current?.focus()} accessibilityRole="none">
            <TextInput
              ref={input}
              value={displayCode(code)}
              onChangeText={(v) => {
                setCode(cleanCode(v));
                setError(null);
              }}
              onSubmitEditing={submit}
              placeholder="K7PM-4XQ2"
              placeholderTextColor={colors.lineFirm}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              keyboardType={Platform.OS === "ios" ? "default" : "visible-password"}
              returnKeyType="go"
              maxLength={CODE_LENGTH + 1}
              style={[styles.codeInput, error ? { borderColor: colors.critical } : null]}
              accessibilityLabel={t("inviteCode")}
            />
          </Pressable>

          {error ? (
            <View style={[styles.banner, { backgroundColor: colors.criticalTint, borderColor: colors.critical }]}>
              <Text style={[styles.body, { color: colors.critical }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.button, !complete || busy ? styles.buttonDisabled : null]}
            onPress={submit}
            disabled={!complete || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !complete || busy }}
          >
            {busy ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color={colors.white} />
                <Text style={styles.buttonText}>{t("settingUp")}</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>{t("continue")}</Text>
            )}
          </Pressable>
        </View>

        <Text style={[styles.faint, { textAlign: "center" }]}>{t("noCode")}</Text>

        {canRegister ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              <Text style={styles.faint}>{t("newHere")}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            </View>
            <Pressable
              style={[styles.button, styles.buttonQuiet]}
              onPress={() => router.push("/register")}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, styles.buttonQuietText]}>{t("registerInstead")}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
