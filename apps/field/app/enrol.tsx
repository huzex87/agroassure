import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { generateKeypair, identity, setDeviceId } from "../src/signer";
import { setInspectorId } from "../src/session";
import { setToken } from "../src/transport";
import { useLanguage } from "../src/i18n";
import { styles } from "../src/theme";

// Enrolment. The keypair is generated here and the private half never leaves:
// what is shown on screen is the public key, which the administrator registers
// against this device in the console. From then on every event this device
// authors carries a signature only this handset could have produced.

export default function Enrol() {
  const router = useRouter();
  const { t } = useLanguage();
  const [publicKey, setPublicKey] = useState("");
  const [deviceId, setDeviceIdInput] = useState("");
  const [userId, setUserId] = useState("");
  const [token, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateKeypair().then(setPublicKey).catch((e) => setError(String(e)));
    identity().then((id) => setDeviceIdInput(id.deviceId ?? ""));
  }, []);

  async function save() {
    setError(null);
    try {
      if (!deviceId.trim() || !userId.trim()) {
        throw new Error("The device id and your user id both come from the console.");
      }
      await setDeviceId(deviceId.trim());
      await setInspectorId(userId.trim());
      if (token.trim()) await setToken(token.trim());
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.h1}>{t("enrolTitle")}</Text>
        <Text style={styles.body}>{t("enrolBody")}</Text>
        <View style={styles.divider} />
        <Text style={styles.muted}>Public key</Text>
        <Text style={styles.mono} selectable>
          {publicKey || "…"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>What the administrator gives back</Text>

        <Text style={styles.muted}>Device id</Text>
        <TextInput
          style={styles.input}
          value={deviceId}
          onChangeText={setDeviceIdInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="00000000-0000-0000-0000-000000000000"
        />

        <Text style={styles.muted}>Your user id</Text>
        <TextInput
          style={styles.input}
          value={userId}
          onChangeText={setUserId}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* ponytail: a pasted token stands in for a sign-in flow. When OIDC
            lands this field goes and the token arrives from the provider. */}
        <Text style={styles.muted}>Session token</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setTokenInput}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        {error ? <Text style={[styles.body, { color: "#B4560F" }]}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={save} accessibilityRole="button">
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
