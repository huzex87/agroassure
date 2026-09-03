// First, before anything that might mint an identifier: Hermes has no global
// crypto, and @noble/hashes needs crypto.getRandomValues to seed randomBytes.
import "../src/crypto-polyfill";

import { useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LanguageContext, type Language } from "../src/i18n";
import { colors } from "../src/theme";

export default function RootLayout() {
  // Language is app state, not a per-screen concern: an inspector switches once
  // and every screen and every checkpoint prompt follows.
  const [language, setLanguage] = useState<Language>("en");

  return (
    <SafeAreaProvider>
      <LanguageContext.Provider value={{ language, setLanguage }}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Screen name="index" options={{ title: "AgroAssure" }} />
          <Stack.Screen name="enrol" options={{ title: "Enrol device" }} />
          <Stack.Screen name="inspection/[id]" options={{ title: "Inspection" }} />
          <Stack.Screen name="signoff/[id]" options={{ title: "Sign off" }} />
        </Stack>
      </LanguageContext.Provider>
    </SafeAreaProvider>
  );
}
