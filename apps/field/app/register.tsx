import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { generateKeypair, setDeviceId } from "../src/signer";
import { setInspectorId, setInspectorName } from "../src/session";
import {
  ApiError,
  registerOptions,
  registrationStatus,
  resendRegistrationCodes,
  setToken,
  startRegistration,
  verifyRegistration,
  type RegisterOptions,
  type RegistrationStatus,
  type RegistrationTicket,
} from "../src/transport";
import { cleanDigits, clearTicket, loadTicket, saveTicket } from "../src/registration";
import { requestSync } from "../src/auto-sync";
import { FinishSetup } from "../src/finish-setup";
import { useLanguage, type StringKey } from "../src/i18n";
import { colors, styles } from "../src/theme";

// Asking to join, from the phone, for someone with no invite code.
//
// Details, then a code from SMS and one from email to prove both are theirs,
// then a wait while an administrator approves them and picks their role. The
// request carries this phone's public key, so when the answer is yes the phone
// is already theirs: the next status check returns a working session, and all
// that is left is choosing a PIN. The request is remembered, so closing the app
// while waiting loses nothing.

const POLL_MS = 15_000;

type Stage =
  | { kind: "loading" }
  | { kind: "closed" }
  | { kind: "details" }
  | { kind: "codes"; status: RegistrationStatus }
  | { kind: "waiting"; status: RegistrationStatus }
  | { kind: "rejected"; status: RegistrationStatus }
  | { kind: "approvedElsewhere"; status: RegistrationStatus }
  | { kind: "finish"; name: string };

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [options, setOptions] = useState<RegisterOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef<RegistrationTicket | null>(null);

  /** Move to wherever this request now stands. */
  const land = useCallback(async (status: RegistrationStatus) => {
    setError(null);
    switch (status.status) {
      case "verifying":
        return setStage({ kind: "codes", status });
      case "pending":
        return setStage({ kind: "waiting", status });
      case "rejected":
        return setStage({ kind: "rejected", status });
      case "withdrawn":
        await clearTicket();
        ticket.current = null;
        return setStage({ kind: "details" });
      case "approved":
        if (!status.session) return setStage({ kind: "approvedElsewhere", status });
        // The same four things an invite code stores, from the same kind of session.
        await setToken(status.session.token);
        await setDeviceId(status.session.deviceId);
        await setInspectorId(status.session.userId);
        await setInspectorName(status.session.fullName);
        await clearTicket();
        ticket.current = null;
        requestSync();
        return setStage({ kind: "finish", name: status.session.fullName });
    }
  }, []);

  // The language can change while this screen is open; the effects below only
  // need whichever wording is current when they report a problem.
  const tRef = useRef(t);
  tRef.current = t;

  // On open: resume a request this phone already made, or start a new one.
  useEffect(() => {
    (async () => {
      const [saved, loaded] = await Promise.all([
        loadTicket(),
        registerOptions().catch(() => null),
      ]);
      setOptions(loaded);
      if (saved) {
        ticket.current = saved;
        try {
          return await land(await registrationStatus(saved));
        } catch (err) {
          // A request the server no longer knows starts over; anything else —
          // no signal, say — keeps the ticket for next time.
          if (err instanceof ApiError && err.reason === "not_found") {
            await clearTicket();
            ticket.current = null;
          } else {
            setError(tRef.current("cannotReach"));
          }
        }
      }
      if (!loaded) {
        setError(tRef.current("cannotReach"));
        return setStage({ kind: "details" });
      }
      setStage(loaded.available ? { kind: "details" } : { kind: "closed" });
    })();
  }, [land]);

  // While waiting, ask again every so often and whenever the app comes back.
  const check = useCallback(async () => {
    if (!ticket.current) return;
    try {
      await land(await registrationStatus(ticket.current));
    } catch {
      /* no signal; the next tick tries again */
    }
  }, [land]);

  useEffect(() => {
    if (stage.kind !== "waiting") return;
    const id = setInterval(check, POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void check();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [stage.kind, check]);

  async function startOver() {
    await clearTicket();
    ticket.current = null;
    setError(null);
    if (!options) {
      try {
        setOptions(await registerOptions());
      } catch {
        setError(t("cannotReach"));
      }
    }
    setStage({ kind: "details" });
  }

  if (stage.kind === "loading") {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (stage.kind === "finish") {
    return <FinishSetup name={stage.name} onFinish={() => router.replace("/")} />;
  }

  const step = stage.kind === "details" ? 0 : stage.kind === "codes" ? 1 : 2;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { flexGrow: 1, justifyContent: "center", gap: 18, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {stage.kind === "closed" ? (
          <Closed onBack={() => router.replace("/activate")} />
        ) : (
          <>
            <Stepper at={step} />
            {stage.kind === "details" ? (
              <Details
                jurisdictions={options?.jurisdictions ?? []}
                error={error}
                onSubmit={async (input) => {
                  setError(null);
                  try {
                    const issued = await startRegistration({ ...input, publicKeyBase64: await generateKeypair() });
                    await saveTicket(issued);
                    ticket.current = issued;
                    await land(await registrationStatus(issued));
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : t("cannotReach"));
                  }
                }}
              />
            ) : null}
            {stage.kind === "codes" ? (
              <Codes
                status={stage.status}
                onVerify={async (codes) => {
                  if (!ticket.current) return null;
                  try {
                    await land(await verifyRegistration(ticket.current, codes));
                    return null;
                  } catch (err) {
                    // A right code beside a wrong one still counted; show it confirmed.
                    void check();
                    return err instanceof ApiError
                      ? { message: err.message, wrong: err.wrong }
                      : { message: t("cannotReach"), wrong: [] };
                  }
                }}
                onResend={async () => {
                  if (!ticket.current) return null;
                  try {
                    await resendRegistrationCodes(ticket.current);
                    return null;
                  } catch (err) {
                    return err instanceof ApiError ? err.message : t("cannotReach");
                  }
                }}
                onStartOver={startOver}
              />
            ) : null}
            {stage.kind === "waiting" ? <Waiting name={stage.status.fullName} onCheck={check} /> : null}
            {stage.kind === "rejected" ? (
              <Outcome
                tone="critical"
                mark="✕"
                title={t("notApprovedTitle")}
                body={t("notApprovedBody")}
                reason={stage.status.rejectReason}
                action={{ label: t("startAgain"), onPress: startOver }}
              />
            ) : null}
            {stage.kind === "approvedElsewhere" ? (
              <Outcome
                tone="good"
                mark="✓"
                title={t("approvedElsewhereTitle")}
                body={t("approvedElsewhereBody")}
                action={{
                  label: t("back"),
                  onPress: async () => {
                    await clearTicket();
                    router.replace("/activate");
                  },
                }}
              />
            ) : null}
            {error && stage.kind !== "details" ? <ErrorBanner message={error} /> : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- pieces -----------------------------------------------------------------

const STEP_KEYS: StringKey[] = ["stepDetails", "stepConfirm", "stepApproval"];

function Stepper({ at }: { at: number }) {
  const { t } = useLanguage();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityRole="progressbar">
      {STEP_KEYS.map((key, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <View key={key} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: done ? colors.primary : current ? colors.primaryTint : colors.surfaceSunk,
                borderWidth: current ? 2 : 1,
                borderColor: done || current ? colors.primary : colors.line,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: done ? colors.white : current ? colors.primaryDark : colors.inkFaint }}>
                {done ? "✓" : i + 1}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={{ flexShrink: 1, fontSize: 12, fontWeight: "600", color: current ? colors.ink : colors.inkMuted }}
            >
              {t(key)}
            </Text>
            {i < STEP_KEYS.length - 1 ? (
              <View style={{ flex: 1, height: 1, minWidth: 8, backgroundColor: done ? colors.primary : colors.line }} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.criticalTint, borderColor: colors.critical }]} accessibilityRole="alert">
      <Text style={[styles.body, { color: colors.critical }]}>{message}</Text>
    </View>
  );
}

function PrimaryButton({ label, busyLabel, busy, disabled, onPress }: {
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const off = busy || disabled;
  return (
    <Pressable
      style={[styles.button, off ? styles.buttonDisabled : null]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
    >
      {busy ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={colors.white} />
          <Text style={styles.buttonText}>{busyLabel}</Text>
        </View>
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.muted, { fontWeight: "600", color: colors.ink }]}>{label}</Text>
      {children}
    </View>
  );
}

function Details({ jurisdictions, error, onSubmit }: {
  jurisdictions: Array<{ id: string; name: string }>;
  error: string | null;
  onSubmit: (input: { fullName: string; phone: string; email: string; jurisdictionId: string }) => Promise<void>;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<string | null>(jurisdictions.length === 1 ? jurisdictions[0]!.id : null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const chosen = jurisdictions.find((j) => j.id === state);

  async function submit() {
    if (!fullName.trim() || !phone.trim() || !email.trim() || !state) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setBusy(true);
    try {
      await onSubmit({ fullName: fullName.trim(), phone: phone.trim(), email: email.trim(), jurisdictionId: state });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ gap: 6 }}>
        <Text style={styles.h1}>{t("registerTitle")}</Text>
        <Text style={[styles.body, { color: colors.inkMuted }]}>{t("registerBody")}</Text>
      </View>

      <View style={[styles.card, { gap: 14 }]}>
        <Labelled label={t("fullName")}>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Aisha Bello"
            placeholderTextColor={colors.inkFaint}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            style={styles.input}
            accessibilityLabel={t("fullName")}
          />
        </Labelled>
        <Labelled label={t("phoneNumber")}>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="0803 123 4567"
            placeholderTextColor={colors.inkFaint}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            style={styles.input}
            accessibilityLabel={t("phoneNumber")}
          />
        </Labelled>
        <Labelled label={t("emailAddress")}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="aisha@example.com"
            placeholderTextColor={colors.inkFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            style={styles.input}
            accessibilityLabel={t("emailAddress")}
          />
        </Labelled>
        <Labelled label={t("yourState")}>
          <Pressable
            onPress={() => setPicking((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={t("yourState")}
            style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
          >
            <Text style={{ fontSize: 16, color: chosen ? colors.ink : colors.inkFaint }}>
              {chosen?.name ?? t("chooseState")}
            </Text>
            <Text style={{ fontSize: 14, color: colors.inkMuted }}>{picking ? "▲" : "▼"}</Text>
          </Pressable>
          {picking ? (
            <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: "hidden" }}>
              {jurisdictions.map((j, i) => {
                const on = j.id === state;
                return (
                  <Pressable
                    key={j.id}
                    onPress={() => {
                      setState(j.id);
                      setPicking(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={{
                      minHeight: 48,
                      paddingHorizontal: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: on ? colors.primaryTint : colors.surface,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.line,
                    }}
                  >
                    <Text style={[styles.body, on ? { color: colors.primaryDark, fontWeight: "600" } : null]}>{j.name}</Text>
                    {on ? <Text style={{ color: colors.primaryDark, fontWeight: "700" }}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </Labelled>

        {missing ? <ErrorBanner message={t("fillEveryField")} /> : null}
        {error ? <ErrorBanner message={error} /> : null}

        <PrimaryButton label={t("sendCodes")} busyLabel={t("sendingCodes")} busy={busy} onPress={submit} />
      </View>

      <Pressable onPress={() => router.replace("/activate")} accessibilityRole="button" style={{ padding: 8 }}>
        <Text style={[styles.muted, { textAlign: "center" }]}>
          {t("haveCode")} <Text style={styles.actionText}>{t("enterItHere")}</Text>
        </Text>
      </Pressable>
    </>
  );
}

function CodeField({ label, value, onChange, wrong }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wrong: boolean;
}) {
  return (
    <Labelled label={label}>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(cleanDigits(v))}
        placeholder="000000"
        placeholderTextColor={colors.lineFirm}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        style={[styles.codeInput, { letterSpacing: 8 }, wrong ? { borderColor: colors.critical } : null]}
        accessibilityLabel={label}
      />
    </Labelled>
  );
}

function Confirmed({ label }: { label: string }) {
  return (
    <View
      style={[styles.banner, { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.goodTint, borderColor: colors.good }]}
    >
      <Text style={{ color: colors.good, fontWeight: "700", fontSize: 16 }}>✓</Text>
      <Text style={[styles.body, { color: colors.good, fontWeight: "600" }]}>{label}</Text>
    </View>
  );
}

function Codes({ status, onVerify, onResend, onStartOver }: {
  status: RegistrationStatus;
  onVerify: (codes: { smsCode?: string; emailCode?: string }) => Promise<{ message: string; wrong: string[] } | null>;
  onResend: () => Promise<string | null>;
  onStartOver: () => void;
}) {
  const { t } = useLanguage();
  const [sms, setSms] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; wrong: string[] } | null>(null);
  const [resent, setResent] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  const needSms = !status.phoneVerified;
  const needEmail = !status.emailVerified;
  // Either code on its own is enough to send: the other can follow.
  const ready = (needSms && sms.length === 6) || (needEmail && email.length === 6);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setRefusal(null);
    const result = await onVerify({
      smsCode: needSms && sms.length === 6 ? sms : undefined,
      emailCode: needEmail && email.length === 6 ? email : undefined,
    });
    setBusy(false);
    if (result) {
      setRefusal(result);
      if (result.wrong.includes("sms")) setSms("");
      if (result.wrong.includes("email")) setEmail("");
    }
  }

  return (
    <>
      <View style={{ gap: 6 }}>
        <Text style={styles.h1}>{t("confirmTitle")}</Text>
        <Text style={[styles.body, { color: colors.inkMuted }]}>{t("confirmBody")}</Text>
      </View>
      <View style={[styles.card, { gap: 14 }]}>
        {needSms ? (
          <CodeField label={t("smsCode")} value={sms} onChange={setSms} wrong={refusal?.wrong.includes("sms") ?? false} />
        ) : (
          <Confirmed label={t("phoneConfirmed")} />
        )}
        {needEmail ? (
          <CodeField label={t("emailCode")} value={email} onChange={setEmail} wrong={refusal?.wrong.includes("email") ?? false} />
        ) : (
          <Confirmed label={t("emailConfirmed")} />
        )}
        {refusal ? <ErrorBanner message={refusal.message} /> : null}
        <PrimaryButton label={t("confirm")} busyLabel={t("checking")} busy={busy} disabled={!ready} onPress={submit} />
        <Pressable
          disabled={resent === "sending"}
          accessibilityRole="button"
          onPress={async () => {
            setResent("sending");
            setResendError(null);
            const failed = await onResend();
            setResent(failed ? "idle" : "sent");
            setResendError(failed);
          }}
          style={{ paddingVertical: 6, alignItems: "center" }}
        >
          <Text style={styles.actionText}>{t("sendNewCodes")}</Text>
        </Pressable>
        {resent === "sent" ? <Text style={[styles.muted, { textAlign: "center", color: colors.good }]}>{t("newCodesSent")}</Text> : null}
        {resendError ? <ErrorBanner message={resendError} /> : null}
      </View>
      <Pressable onPress={onStartOver} accessibilityRole="button" style={{ padding: 8 }}>
        <Text style={[styles.muted, { textAlign: "center" }]}>{t("startAgain")}</Text>
      </Pressable>
    </>
  );
}

function Waiting({ name, onCheck }: { name: string; onCheck: () => Promise<void> }) {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const first = name.trim().split(/\s+/)[0] ?? name;
  return (
    <>
      <View style={[styles.card, { alignItems: "center", paddingVertical: 28, gap: 12 }]}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primaryTint,
            borderWidth: 1,
            borderColor: colors.primaryLine,
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
        <Text style={[styles.h1, { textAlign: "center" }]}>{t("waitingTitle")}</Text>
        <Text style={[styles.body, { textAlign: "center", color: colors.inkMuted }]}>
          {first ? `${first} — ` : ""}
          {t("waitingBody")}
        </Text>
        <View style={{ alignSelf: "stretch", gap: 8, marginTop: 6 }}>
          <Confirmed label={t("phoneConfirmed")} />
          <Confirmed label={t("emailConfirmed")} />
        </View>
      </View>
      <Pressable
        style={[styles.button, styles.buttonQuiet]}
        accessibilityRole="button"
        disabled={checking}
        onPress={async () => {
          setChecking(true);
          await onCheck();
          setChecking(false);
        }}
      >
        {checking ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.buttonText, styles.buttonQuietText]}>{t("checkNow")}</Text>}
      </Pressable>
    </>
  );
}

function Outcome({ tone, mark, title, body, reason, action }: {
  tone: "good" | "critical";
  mark: string;
  title: string;
  body: string;
  reason?: string | null;
  action: { label: string; onPress: () => void };
}) {
  const { t } = useLanguage();
  const hue = tone === "good" ? colors.good : colors.critical;
  const tint = tone === "good" ? colors.goodTint : colors.criticalTint;
  return (
    <>
      <View style={[styles.card, { alignItems: "center", paddingVertical: 28, gap: 12 }]}>
        <View style={{ width: 56, height: 56, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: tint }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: hue }}>{mark}</Text>
        </View>
        <Text style={[styles.h1, { textAlign: "center" }]}>{title}</Text>
        {reason ? (
          <View style={[styles.banner, styles.bannerQuiet, { alignSelf: "stretch" }]}>
            <Text style={styles.overline}>{t("reasonGiven")}</Text>
            <Text style={styles.body}>{reason}</Text>
          </View>
        ) : null}
        <Text style={[styles.body, { textAlign: "center", color: colors.inkMuted }]}>{body}</Text>
      </View>
      <Pressable style={styles.button} onPress={action.onPress} accessibilityRole="button">
        <Text style={styles.buttonText}>{action.label}</Text>
      </Pressable>
    </>
  );
}

function Closed({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();
  return (
    <>
      <View style={[styles.card, { alignItems: "center", paddingVertical: 28, gap: 12 }]}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>A</Text>
        </View>
        <Text style={[styles.h1, { textAlign: "center" }]}>{t("registerTitle")}</Text>
        <Text style={[styles.body, { textAlign: "center", color: colors.inkMuted }]}>{t("registrationClosed")}</Text>
      </View>
      <Pressable style={styles.button} onPress={onBack} accessibilityRole="button">
        <Text style={styles.buttonText}>{t("back")}</Text>
      </Pressable>
    </>
  );
}
