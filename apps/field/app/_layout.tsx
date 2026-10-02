// First, before anything that might mint an identifier: Hermes has no global
// crypto, and @noble/hashes needs crypto.getRandomValues to seed randomBytes.
import "../src/crypto-polyfill";

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LanguageContext, phoneLanguage, storeLanguage, storedLanguage, t, type Language } from "../src/i18n";
import { colors, styles } from "../src/theme";
import { PinGate } from "../src/pin-gate";

export default function RootLayout() {
  // Language is app state, not a per-screen concern: an inspector switches once
  // and every screen and every checkpoint prompt follows. Undefined while the
  // stored choice is read; null when there is none, in which case the phone's
  // own language is used until one is chosen.
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
      ) : (
        <LanguageContext.Provider
          value={{ language: language ?? phoneLanguage(), setLanguage }}
        >
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
            <Stack.Screen name="account" options={{ title: t("account", language ?? phoneLanguage()) }} />
            <Stack.Screen name="set-pin" options={{ headerShown: false }} />
            <Stack.Screen name="inspection/[id]" options={{ title: "" }} />
            <Stack.Screen name="signoff/[id]" options={{ title: t("signOff", language ?? phoneLanguage()) }} />
          </Stack>
          <PinGate />
        </LanguageContext.Provider>
      )}
    </SafeAreaProvider>
  );
}
