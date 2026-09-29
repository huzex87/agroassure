import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setPin } from "./pin";
import { PinPad } from "./pin-pad";
import { useLanguage } from "./i18n";
import { styles } from "./theme";

// The last two screens of getting a phone working, however it got there — an
// invite code or an approved registration: choose a PIN, then a welcome.
//
// The PIN comes first because from this moment the phone holds a working
// session, and a phone lost before it has a PIN is a phone anyone can use.

type Step = "choose" | "confirm" | "done";

export function FinishSetup({ name, onFinish }: { name: string | null; onFinish: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("choose");
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  if (step !== "done") {
    return (
      <View style={[styles.screen, styles.content, { justifyContent: "center", paddingBottom: insets.bottom + 24 }]}>
        <PinPad
          title={step === "choose" ? t("choosePin") : t("confirmPin")}
          subtitle={step === "choose" ? t("choosePinBody") : null}
          error={pinError}
          deleteLabel={t("deletePin")}
          onComplete={async (pin) => {
            if (step === "choose") {
              setFirstPin(pin);
              setPinError(null);
              setStep("confirm");
              return;
            }
            if (pin !== firstPin) {
              setFirstPin(null);
              setPinError(t("pinMismatch"));
              setStep("choose");
              return;
            }
            await setPin(pin);
            setPinError(null);
            setStep("done");
          }}
        />
      </View>
    );
  }

  const first = name?.trim().split(/\s+/)[0] ?? "";
  return <Welcome title={`${t("welcomeName")}, ${first}`} body={t("deviceReadyBody")} onContinue={onFinish} />;
}

/** A tick, a sentence, and the way on. */
export function Welcome({ title, body, onContinue }: { title: string; body: string; onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  return (
    <View style={[styles.screen, styles.content, { justifyContent: "center", paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.card, { alignItems: "center", paddingVertical: 28 }]}>
        <View style={styles.successBadge}>
          <Text style={styles.successTick}>✓</Text>
        </View>
        <Text style={[styles.h1, { textAlign: "center" }]}>{title}</Text>
        <Text style={[styles.muted, { textAlign: "center" }]}>{body}</Text>
      </View>
      <Pressable style={styles.button} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.buttonText}>{t("seeVisits")}</Text>
      </Pressable>
    </View>
  );
}
