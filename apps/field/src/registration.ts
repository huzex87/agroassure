import * as SecureStore from "expo-secure-store";
import type { RegistrationTicket } from "./transport";

// A request to join, remembered across restarts. Approval can take a day; the
// person should be able to close the app, open it tomorrow, and land back on
// "waiting for approval" — or straight on "choose your PIN" if it came through.

const TICKET = "agroassure.registration";

export async function saveTicket(ticket: RegistrationTicket): Promise<void> {
  await SecureStore.setItemAsync(TICKET, JSON.stringify(ticket));
}

export async function loadTicket(): Promise<RegistrationTicket | null> {
  const raw = await SecureStore.getItemAsync(TICKET);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RegistrationTicket>;
    return typeof parsed.registrationId === "string" && typeof parsed.token === "string"
      ? { registrationId: parsed.registrationId, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

export async function clearTicket(): Promise<void> {
  await SecureStore.deleteItemAsync(TICKET);
}

/** Six digits, however they were typed or pasted. */
export function cleanDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}
