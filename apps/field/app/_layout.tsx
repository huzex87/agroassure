// First, before anything that might mint an identifier: Hermes has no global
// crypto, and @noble/hashes needs crypto.getRandomValues to seed randomBytes.
import "../src/crypto-polyfill";

import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LanguageContext, storeLanguage, storedLanguage, t, type Language } from "../src/i18n";
import { colors, styles } from "../src/theme";
import { PinGate } from "../src/pin-gate";

export default function RootLayout() {
  // Language is app state, not a per-screen concern: an inspector switches once
  // and every screen and every checkpoint prompt follows. Undefined while the
  // stored choice is read; null when there is none yet and it must be asked.
  const [language, setLanguageState] = useState<Language | null | undefined>(undefined);

  useEffect(() => {
    storedLanguage()
      .then(setLanguageState)
      .catch(() => setLanguageState(null));
  }, []);

  function setLanguage(next: Language) {
    setLanguageState(next);
    void storeLanguage(next);
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {language === undefined ? (
        <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : language === null ? (
        <LanguagePicker onPick={setLanguage} />
      ) : (
        <LanguageContext.Provider value={{ language, setLanguage }}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.ink,
              headerTitleStyle: { fontWeight: "600" },
              contentStyle: { backgroundColor: colors.canvas },
            }}
          >
            <Stack.Screen name="index" options={{ title: "AgroAssure" }} />
            <Stack.Screen name="activate" options={{ headerShown: false }} />
            <Stack.Screen name="register" options={{ headerShown: false }} />
            <Stack.Screen name="account" options={{ title: t("account", language) }} />
            <Stack.Screen name="inspection/[id]" options={{ title: "" }} />
            <Stack.Screen name="signoff/[id]" options={{ title: t("signOff", language) }} />
          </Stack>
          <PinGate />
        </LanguageContext.Provider>
      )}
    </SafeAreaProvider>
  );
}

/**
 * The first thing the app ever shows. Both options are written in their own
 * language, so the question is answerable by someone who reads only one of them.
 */
function LanguagePicker({ onPick }: { onPick: (l: Language) => void }) {
  return (
    <SafeAreaView style={[styles.screen, { justifyContent: "center" }]}>
      <View style={[styles.content, { gap: 20 }]}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>A</Text>
          </View>
          <Text style={[styles.h1, { textAlign: "center" }]}>AgroAssure</Text>
          <Text style={[styles.muted, { textAlign: "center" }]}>
            {t("chooseLanguage", "en")} · {t("chooseLanguage", "ha")}
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Pressable style={styles.button} onPress={() => onPick("en")} accessibilityRole="button">
            <Text style={styles.buttonText}>English</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={() => onPick("ha")} accessibilityRole="button">
            <Text style={styles.buttonText}>Hausa</Text>
          </Pressable>
        </View>
        <Text style={[styles.faint, { textAlign: "center" }]}>
          {t("chooseLanguageBody", "en")}
        </Text>
      </View>
    </SafeAreaView>
  );
}
