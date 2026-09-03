import { getRandomValues } from "expo-crypto";

// A web-standard crypto.getRandomValues, on a runtime that has none.
//
// Hermes ships no global crypto, and Expo does not install one. Node does, so
// every test passed and the gap only appeared on a handset — at the first call
// to uuidv7(), which is to say the first time the device tried to mint an
// identifier for anything.
//
// @noble/hashes reaches for globalThis.crypto.getRandomValues to seed
// randomBytes, and it is right to: the alternative is a library inventing its
// own entropy source, which is how you end up with predictable keys. The fix is
// to give the runtime the standard function rather than to weaken the library.
//
// expo-crypto is the source because it is already a dependency and already
// proven on device — it is what generates the device signing key at enrolment.
// react-native-get-random-values is the usual answer to this and would work in
// a development build, but it carries native code that Expo Go does not bundle,
// so it would break the one way this app can currently be run on a phone.
//
// Imported for its side effect, first, before anything that might call it.

const target = globalThis as typeof globalThis & {
  crypto?: Partial<Crypto>;
};

if (target.crypto === undefined) {
  // Defined rather than assigned: on some runtimes the property exists as a
  // non-writable accessor, and a plain assignment there fails silently.
  Object.defineProperty(target, "crypto", {
    value: {},
    configurable: true,
    writable: true,
  });
}

if (typeof target.crypto?.getRandomValues !== "function") {
  Object.defineProperty(target.crypto as object, "getRandomValues", {
    value: getRandomValues,
    configurable: true,
    writable: true,
  });
}
