import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import type { GeoPoint } from "@agroassure/domain";

// Capture. The hash is computed over the exact bytes at the instant the photo
// is taken, and the coordinates and time are bound to that hash here, once.
// Nothing re-derives them later, so the metadata cannot be attached to a
// different file and the file cannot claim different coordinates.

export interface CapturedExhibit {
  sha256: string;
  localUri: string;
  mime: string;
  capturedAt: string;
  at: GeoPoint;
}

/** SHA-256 over the file's bytes, read back from disk exactly as written. */
export async function hashFile(localUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // digestStringAsync over base64 would hash the encoding, not the bytes, so
  // the bytes are decoded first and hashed as themselves.
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function currentPosition(): Promise<GeoPoint> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission is needed to record where an inspection happened.");
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: position.coords.accuracy ?? undefined,
  };
}

/**
 * Everything an exhibit needs, gathered in one step. The device clock supplies
 * the capture time; it may drift, which is why ordering across the record uses
 * hybrid logical clocks rather than trusting it.
 */
export async function describeCapture(
  localUri: string,
  mime = "image/jpeg",
): Promise<CapturedExhibit> {
  const [sha256, at] = await Promise.all([hashFile(localUri), currentPosition()]);
  return {
    sha256,
    localUri,
    mime,
    capturedAt: new Date().toISOString(),
    at,
  };
}

export async function readFileBytes(localUri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
