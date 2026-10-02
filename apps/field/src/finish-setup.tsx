import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setPin } from "./pin";
import { PinPad } from "./pin-pad";
import { useLanguage } from "./i18n";
import { styles } from "./theme";

// The last screen of getting a phone working, however it got there — an invite
// code or an approved registration: a welcome, and the way on.
//
// A PIN is offered here, not demanded. The first thing a new inspector should
// see is their visits, not a keypad; the phone's own screen lock is the first
// line of defence and the PIN is an extra for phones that are shared or
// borrowed. It can be added at any time from Account, and an administrator can
// still sign a lost phone out remotely.

export function FinishSetup({ name, onFinish }: { name: string | null; onFinish: () => void }) {
  const { t } = useLanguage();
  const [choosing, setChoosing] = useState(false);

  if (choosing) return <PinSetup onDone={onFinish} onCancel={() => setChoosing(false)} />;

  const first = name?.trim().split(/\s+/)[0] ?? "";
  return (
    <Welcome
      title={`${t("welcomeName")}, ${first}`}
      body={t("deviceReadyBody")}
      onContinue={onFinish}
      secondary={{ label: t("addPin"), hint: t("addPinBody"), onPress: () => setChoosing(true) }}
    />
  );
}

type Step = "choose" | "confirm";

/** Choose a PIN and confirm it. Used after setup and from Account. */
export function PinSetup({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("choose");
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

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
          onDone();
        }}
        footer={
          onCancel ? (
            <Pressable onPress={onCancel} accessibilityRole="button" style={{ padding: 10 }}>
              <Text style={[styles.actionText, { textAlign: "center" }]}>{t("cancel")}</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

/** A tick, a sentence, and the way on — with an optional quieter second choice. */
export function Welcome({
  title,
  body,
  onContinue,
  secondary,
}: {
  title: string;
  body: string;
  onContinue: () => void;
  secondary?: { label: string; hint: string; onPress: () => void };
}) {
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
      {secondary ? (
        <View style={{ gap: 6 }}>
          <Pressable
            style={[styles.button, styles.buttonQuiet]}
            onPress={secondary.onPress}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, styles.buttonQuietText]}>{secondary.label}</Text>
          </Pressable>
          <Text style={[styles.faint, { textAlign: "center" }]}>{secondary.hint}</Text>
        </View>
      ) : null}
    </View>
  );
}
