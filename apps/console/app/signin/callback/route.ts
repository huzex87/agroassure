import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, oidcSettings } from "../../../lib/oidc";

// Where the identity provider sends the user back.
//
// The state cookie is the CSRF defence: without checking it, anyone could hand a
// signed-in officer a link that completes a sign-in as somebody else. It is
// compared, then deleted along with the PKCE verifier, so neither can be
// replayed against a second callback.

export const dynamic = "force-dynamic";

const SESSION = "agroassure_session";
const VERIFIER = "agroassure_pkce_verifier";
const STATE = "agroassure_oidc_state";

function failed(request: NextRequest, reason: string): NextResponse {
  const url = new URL("/signin", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const settings = oidcSettings();
  if (!settings) return failed(request, "No identity provider is configured.");

  const params = request.nextUrl.searchParams;
  // The provider reports its own failures here — a cancelled sign-in, a user
  // who is not permitted this application.
  if (params.get("error")) {
    return failed(request, params.get("error_description") ?? params.get("error")!);
  }

  const code = params.get("code");
  const state = params.get("state");
  const jar = await cookies();
  const expectedState = jar.get(STATE)?.value;
  const verifier = jar.get(VERIFIER)?.value;

  jar.delete(STATE);
  jar.delete(VERIFIER);

  if (!code || !verifier) return failed(request, "This sign-in has expired. Please start again.");
  if (!state || !expectedState || state !== expectedState) {
    return failed(request, "This sign-in could not be verified. Please start again.");
  }

  try {
    const { access_token, expires_in } = await exchangeCode(settings, code, verifier);
    jar.set(SESSION, access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Follow the provider's lifetime where it gives one: a console session
      // outliving the token it holds just means a confusing 401 later.
      maxAge: expires_in && expires_in > 0 ? expires_in : 60 * 60 * 8,
    });
  } catch (err) {
    return failed(request, err instanceof Error ? err.message : "Sign-in failed.");
  }

  return NextResponse.redirect(new URL("/", request.url));
}
