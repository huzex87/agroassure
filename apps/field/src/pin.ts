import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { bytesToBase64, sha256Hex } from "@agroassure/domain";
import { clearInspector } from "./session";
import { clearToken } from "./transport";

// A four-digit PIN between a phone and the inspection records on it.
//
// Phones in the field are shared, borrowed and lost. The PIN is asked when the
// app opens and when it comes back after five minutes away. It is stored as a
// salted hash in the keystore-backed secure store; four digits cannot resist
// someone who has already extracted that store, so what actually protects it is
// the store itself and the limit on guesses.
//
// Forgetting the PIN, or five wrong tries, signs the person out but keeps the
// phone's signing key and every inspection not yet sent. A new invite code for
// the same person brings the phone straight back, with nothing lost: the key is
// what the unsent work is signed with, and destroying it would destroy the work.

const HASH = "agroassure.pin.hash";
const SALT = "agroassure.pin.salt";
const FAILURES = "agroassure.pin.failures";

export const PIN_LENGTH = 4;
export const MAX_TRIES = 5;
/** How long the app may be away before the PIN is asked again. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;

function digest(salt: string, pin: string): string {
  // Stretched a little so a copied hash is not free to reverse, without making
  // an unlock on a cheap phone feel slow.
  let value = new TextEncoder().encode(`${salt}:${pin}`);
  let hex = "";
  for (let i = 0; i < 2000; i++) {
    hex = sha256Hex(value);
    value = new TextEncoder().encode(hex);
  }
  return hex;
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function hasPin(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(HASH));
}

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`A PIN is ${PIN_LENGTH} digits`);
  const salt = bytesToBase64(Crypto.getRandomBytes(16));
  await SecureStore.setItemAsync(SALT, salt);
  await SecureStore.setItemAsync(HASH, digest(salt, pin));
  await SecureStore.deleteItemAsync(FAILURES);
}

export type PinCheck = { ok: true } | { ok: false; triesLeft: number };

/** Check a PIN, counting wrong ones. At zero tries left the caller signs out. */
export async function checkPin(pin: string): Promise<PinCheck> {
  const [hash, salt] = await Promise.all([SecureStore.getItemAsync(HASH), SecureStore.getItemAsync(SALT)]);
  if (!hash || !salt) return { ok: true };
  if (digest(salt, pin) === hash) {
    await SecureStore.deleteItemAsync(FAILURES);
    return { ok: true };
  }
  const failures = Number((await SecureStore.getItemAsync(FAILURES)) ?? "0") + 1;
  await SecureStore.setItemAsync(FAILURES, String(failures));
  return { ok: false, triesLeft: Math.max(0, MAX_TRIES - failures) };
}

/**
 * Sign the person out and forget the PIN, keeping the key and the outbox.
 * What is left is a phone that needs a new invite code — for the same person,
 * whose unsent inspections then send as normal.
 */
export async function signOutKeepingWork(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(HASH),
    SecureStore.deleteItemAsync(SALT),
    SecureStore.deleteItemAsync(FAILURES),
  ]);
  await clearToken();
  await clearInspector();
  // The device key and id stay: activation with the same person's new code
  // finds this key already registered to them and hands the same phone back.
}

/** Forget the PIN too, for a full sign-out. */
export async function clearPin(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(HASH),
    SecureStore.deleteItemAsync(SALT),
    SecureStore.deleteItemAsync(FAILURES),
  ]);
}
