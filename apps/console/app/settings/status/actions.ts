"use server";

import { ApiError, post } from "../../../lib/api";

export type TestEmailState =
  | { status: "idle" }
  | { status: "sent"; message: string }
  | { status: "failed"; message: string };

/**
 * Send a real email to the signed-in administrator and report what the
 * provider answered. A refusal from the provider is the most useful thing this
 * page can show, because it names the problem in the provider's own words.
 */
export async function sendTestEmail(): Promise<TestEmailState> {
  try {
    const result = await post<{ ok: boolean; message: string }>("/v1/system/test-email");
    return result.ok ? { status: "sent", message: result.message } : { status: "failed", message: result.message };
  } catch (err) {
    if (err instanceof ApiError) return { status: "failed", message: err.message };
    throw err;
  }
}
