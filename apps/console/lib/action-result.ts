import { ApiError } from "./api";

// What a button-style server action reports back. A plain `<form action>` that
// throws takes the whole page to the error screen, and one that succeeds says
// nothing, so a click on "Cancel invite" or "Sign out this phone" looked like it
// did nothing at all. Returning a result lets the page stay put and say what
// happened.

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Run a command and report the gateway's refusal as a message a person can act
 * on. Anything else, such as a redirect to sign in or an outage, is left to
 * travel as it would, because it is not something this click can fix.
 */
export async function attempt(run: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await run();
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, message: err.message };
    throw err;
  }
}
