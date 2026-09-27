import jwt from "jsonwebtoken";

// The session a console user holds after spending a sign-in link.
//
// Like a phone's, it names a person and nothing else. Their roles and state
// are read from the register on every request, so removing a role or
// suspending someone takes effect on their next click, not when a token that
// still claims the old authority happens to expire.

export const CONSOLE_SESSION_ISSUER = "agroassure";
export const CONSOLE_SESSION_AUDIENCE = "agroassure-console";
export const CONSOLE_SESSION_TYPE = "console";

/** A working day. Long enough not to interrupt one; short enough to end with it. */
export const CONSOLE_SESSION_TTL_SECONDS = 10 * 60 * 60;

export function signConsoleSession(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, typ: CONSOLE_SESSION_TYPE }, secret, {
    algorithm: "HS256",
    issuer: CONSOLE_SESSION_ISSUER,
    audience: CONSOLE_SESSION_AUDIENCE,
    expiresIn: CONSOLE_SESSION_TTL_SECONDS,
  });
}

/** Read without verifying, only to choose which verification applies. */
export function looksLikeConsoleSession(token: string): boolean {
  const decoded = jwt.decode(token, { json: true });
  return decoded?.typ === CONSOLE_SESSION_TYPE && decoded?.aud === CONSOLE_SESSION_AUDIENCE;
}

export function verifyConsoleSession(token: string, secret: string): { sub: string } {
  const claims = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: CONSOLE_SESSION_ISSUER,
    audience: CONSOLE_SESSION_AUDIENCE,
  }) as jwt.JwtPayload;
  if (claims.typ !== CONSOLE_SESSION_TYPE || typeof claims.sub !== "string") {
    throw new Error("not a console session");
  }
  return { sub: claims.sub };
}
