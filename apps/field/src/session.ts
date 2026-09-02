import * as SecureStore from "expo-secure-store";
import { EventAuthor, FieldInspection, type FieldStore } from "@agroassure/field-core";
import { getSigner } from "./signer";
import { getStore } from "./db";

// Who is working, on which device. The inspector's identity is stamped on every
// event as actor_user_id alongside the device signature, so the record says both
// which person answered and which enrolled device it came from.
//
// ponytail: the user id comes from the session token issued at sign-in. There is
// no OIDC flow yet — the console and the gateway are both on a development token
// — so this reads what enrolment stored. When real auth lands, this is the file
// that changes; nothing downstream knows where the id came from.

let cached: { inspection: FieldInspection; store: FieldStore } | null = null;

export async function inspectionSession(actorUserId: string): Promise<{
  inspection: FieldInspection;
  store: FieldStore;
}> {
  if (cached) return cached;
  const store = getStore();
  const signer = await getSigner();
  const author = new EventAuthor(store, signer, { actorUserId });
  cached = { inspection: new FieldInspection(store, author), store };
  return cached;
}

/** After enrolment or revocation the signer has changed; rebuild on next use. */
export function resetSession(): void {
  cached = null;
}

const USER_ID = "agroassure.user.id";

export async function setInspectorId(userId: string): Promise<void> {
  await SecureStore.setItemAsync(USER_ID, userId);
  resetSession();
}

export async function inspectorId(): Promise<string | null> {
  return SecureStore.getItemAsync(USER_ID);
}
