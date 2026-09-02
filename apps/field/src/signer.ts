import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import {
  bytesToBase64,
  derivePublicKey,
  signEventHash,
  base64ToBytes,
} from "@agroassure/domain";
import type { Signer } from "@agroassure/field-core";

// The device key. Every field event is signed with it, which is what makes
// attribution cryptographic rather than clerical: the server can prove which
// enrolled device authored an event, and the device cannot repudiate it.
//
// ponytail: the private key is held in expo-secure-store, which on Android is
// backed by a Keystore-encrypted store. That protects it at rest, but the key
// material does pass through JavaScript to sign, so this is not the
// non-exportable hardware key the guide describes. Closing that gap needs a
// small native module that generates the key inside the Keystore and signs
// there, exposing only sign(hash). The Signer port is exactly that interface,
// so the swap touches this file and nothing else.

const PRIVATE_KEY = "agroassure.device.privateKey";
const DEVICE_ID = "agroassure.device.id";

export interface DeviceIdentity {
  deviceId: string | null;
  publicKeyBase64: string;
}

/**
 * Generate this device's keypair, once. The public half is shown on the
 * enrolment screen for an administrator to register; the private half is
 * written to secure storage and never leaves the device.
 */
export async function generateKeypair(): Promise<string> {
  const existing = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (existing) return bytesToBase64(derivePublicKey(base64ToBytes(existing)));

  const priv = Crypto.getRandomBytes(32);
  await SecureStore.setItemAsync(PRIVATE_KEY, bytesToBase64(priv), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return bytesToBase64(derivePublicKey(priv));
}

export async function identity(): Promise<DeviceIdentity> {
  const priv = await SecureStore.getItemAsync(PRIVATE_KEY);
  return {
    deviceId: await SecureStore.getItemAsync(DEVICE_ID),
    publicKeyBase64: priv ? bytesToBase64(derivePublicKey(base64ToBytes(priv))) : "",
  };
}

/** Recorded once the administrator has enrolled this device. */
export async function setDeviceId(deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_ID, deviceId);
}

export async function getSigner(): Promise<Signer> {
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID);
  const priv = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (!deviceId || !priv) {
    throw new Error("this device is not enrolled yet");
  }
  const key = base64ToBytes(priv);
  return {
    deviceId,
    sign: (eventHashHex) => signEventHash(eventHashHex, key),
  };
}

/** Revoked or reassigned: forget everything about this device's identity. */
export async function forgetIdentity(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIVATE_KEY);
  await SecureStore.deleteItemAsync(DEVICE_ID);
}
