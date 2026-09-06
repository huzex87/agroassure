import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { generateKeypair, identity, setDeviceId, forgetIdentity } from "../src/signer";
import { setInspectorId, inspectorId, resetSession } from "../src/session";
import {
  fetchDeviceState,
  fetchSignInUsers,
  requestEnrolment,
  signInAs,
  type DeviceState,
  type SignInUser,
} from "../src/transport";
import { useLanguage } from "../src/i18n";
import { colors, styles } from "../src/theme";

// Getting a handset into service.
//
// This screen used to ask an inspector for a device id, a user id and a session
// token — three opaque strings someone else had to generate and they had to
// type in correctly. That is systems administration, and it was the single most
// confusing thing in the application.
//
// It is now: say who you are, and the device offers its own public key. An
// administrator approves it from the console. The private half never leaves the
// keystore, and the approval gate is unchanged — the gateway refuses events from
// any device that is not active — so nothing was traded away for the
// convenience. What went away is a person carrying a key between two machines.

type Step = "loading" | "signIn" | "pending" | "active";

export default function Enrol() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>("loading");
  const [users, setUsers] = useState<SignInUser[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const key = await generateKeypair();
    setPublicKey(key);

    const who = await inspectorId();
    setMe(who);
    if (!who) {
      // Not signed in yet. Offer whoever this deployment will accept.
      const list = await fetchSignInUsers().catch(() => [] as SignInUser[]);
      setUsers(list);
      setStep("signIn");
      return;
    }

    // "none" means the server has never seen this key. Treating that as
    // "pending" put the screen into a wait for an approval nobody had been
    // asked for — a handset that had signed in once could sit on "waiting for
    // approval" forever, which is the failure this rework existed to remove.
    // If there is no request, make one.
    const state = await fetchDeviceState(key);
    const settled = state.status === "none" ? await requestEnrolment(key) : state;
    setDevice(settled);
    if (settled.status === "active") {
      await setDeviceId(settled.deviceId!);
      resetSession();
      setStep("active");
    } else {
      setStep("pending");
    }
  }, []);

  useEffect(() => {
    refresh().catch(async (e) => {
      // A stored identity the server will not honour is not an error to stare
      // at, it is a sign-in that has run out. Offer the names again rather than
      // leaving the inspector on a message with no control on it.
      setError(e instanceof Error ? e.message : String(e));
      await setInspectorId("");
      resetSession();
      setMe(null);
      setUsers(await fetchSignInUsers().catch(() => [] as SignInUser[]));
      setStep("signIn");
    });
  }, [refresh]);

  async function chooseUser(user: SignInUser) {
    setBusy(true);
    setError(null);
    try {
      const { userId } = await signInAs(user.email);
      await setInspectorId(userId);
      // Ask straight away. There is nothing else the inspector could usefully
      // do at this point, and one tap is better than two.
      const state = await requestEnrolment(publicKey, user.full_name);
      setDevice(state);
      if (state.status === "active") {
        await setDeviceId(state.deviceId!);
        resetSession();
        setStep("active");
      } else {
        setStep("pending");
      }
      setMe(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    setError(null);
    try {
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await forgetIdentity();
    await setInspectorId("");
    resetSession();
    setDevice(null);
    setMe(null);
    await check();
  }

  const content = styles.content;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[content, { paddingBottom: insets.bottom + 32 }]}
    >
      {error ? (
        <View style={[styles.card, { borderColor: colors.warn }]}>
          <Text style={[styles.body, { color: colors.warn }]}>{error}</Text>
        </View>
      ) : null}

      {step === "loading" ? (
        <View style={styles.card}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {step === "signIn" ? (
        <View style={styles.card}>
          <Text style={styles.h1}>{t("whoAreYou")}</Text>
          <Text style={styles.muted}>{t("signInBody")}</Text>
          <View style={styles.divider} />

          {users.length === 0 ? (
            <Text style={styles.body}>{t("noSignInAvailable")}</Text>
          ) : (
            users.map((user) => (
              <Pressable
                key={user.id}
                style={[styles.button, styles.buttonQuiet, { alignItems: "flex-start" }]}
                onPress={() => chooseUser(user)}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, styles.buttonQuietText]}>{user.full_name}</Text>
                <Text style={styles.muted}>{user.roles.join(", ").replace(/_/g, " ")}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {step === "pending" ? (
        <View style={styles.card}>
          <Text style={styles.h1}>{t("awaitingApproval")}</Text>
          <Text style={styles.body}>{t("awaitingApprovalBody")}</Text>
          <View style={styles.divider} />
          <Text style={styles.muted}>{t("thisDevice")}</Text>
          <Text style={styles.mono} selectable>
            {publicKey}
          </Text>
          <Pressable style={styles.button} onPress={check} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("checkAgain")}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {step === "active" ? (
        <View style={styles.card}>
          <Text style={styles.h1}>{t("deviceReady")}</Text>
          <Text style={styles.body}>{t("deviceReadyBody")}</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/")}>
            <Text style={styles.buttonText}>{t("todaysVisits")}</Text>
          </Pressable>
        </View>
      ) : null}

      {me ? (
        <Pressable
          style={[styles.button, styles.buttonQuiet]}
          onPress={signOut}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, styles.buttonQuietText]}>{t("signOutDevice")}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
