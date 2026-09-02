"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Ending a session. Its own module because a server action cannot be declared
// inline in the layout, and the layout is where the control belongs: a
// compliance console gets used on shared machines in an office, and an officer
// who cannot sign out leaves an authorising session open behind them.

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete("agroassure_session");
  // The provider's own session is not ended here. Single logout needs the
  // provider's end_session endpoint and its post-logout redirect registered,
  // which is a deployment decision; this clears the console's session, which is
  // the part this application owns.
  redirect("/signin");
}
