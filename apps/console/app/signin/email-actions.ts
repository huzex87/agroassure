"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Email sign-in, from the console's side. The gateway sends the link and
// decides whether it is good; this only carries the request and, once a link
// is spent, keeps the session it returns in an httpOnly cookie.

const API_BASE = process.env.AGROASSURE_API_URL ?? "http://localhost:3001";
const SESSION = "agroassure_session";

async function readMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

export async function sendSignInLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/signin?error=" + encodeURIComponent("Enter your work email address."));
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/v1/auth/email/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
  } catch {
    redirect("/signin?error=" + encodeURIComponent("The server could not be reached. Try again in a moment."));
  }
  if (!response.ok) {
    const message = (await readMessage(response)) ?? "That didn't go through. Try again in a moment.";
    redirect("/signin?error=" + encodeURIComponent(message));
  }
  redirect("/signin?sent=" + encodeURIComponent(email));
}

export async function continueWithLink(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/v1/auth/email/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
  } catch {
    redirect("/signin?error=" + encodeURIComponent("The server could not be reached. Try again in a moment."));
  }
  if (!response.ok) {
    const message =
      (await readMessage(response)) ?? "This sign-in link has expired or has already been used. Ask for a new one.";
    redirect("/signin?error=" + encodeURIComponent(message));
  }
  const { token: session, expiresIn } = (await response.json()) as { token: string; expiresIn: number };

  const jar = await cookies();
  jar.set(SESSION, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresIn,
  });
  redirect("/");
}
