import jwt from "jsonwebtoken";

// The session a phone holds after its invitation is spent.
//
// It names a person and a phone, and nothing else: no roles, no jurisdiction.
// Those are read from the database on every request (see DeviceAuthGuard), so
// signing a phone out remotely, suspending the person, or taking away their
// inspector role takes effect on the very next request rather than whenever
// the token happens to expire. That is what makes a long lifetime safe: the
// token is only ever as good as the phone's current standing.

export const DEVICE_SESSION_ISSUER = "agroassure";
export const DEVICE_SESSION_AUDIENCE = "agroassure-field";
export const DEVICE_SESSION_TYPE = "device";

/** Long, because re-inviting someone in the field is expensive and revocation is immediate anyway. */
export const DEVICE_SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;

export interface DeviceSessionClaims {
  sub: string;
  device_id: string;
  typ: typeof DEVICE_SESSION_TYPE;
}

export function signDeviceSession(userId: string, deviceId: string, secret: string): string {
  const claims: DeviceSessionClaims = { sub: userId, device_id: deviceId, typ: DEVICE_SESSION_TYPE };
  return jwt.sign(claims, secret, {
    algorithm: "HS256",
    issuer: DEVICE_SESSION_ISSUER,
    audience: DEVICE_SESSION_AUDIENCE,
    expiresIn: DEVICE_SESSION_TTL_SECONDS,
  });
}

/**
 * Whether a token claims to be a phone session, read without verifying it.
 * Only used to decide which verification to apply; the claim is then checked
 * against the device secret, so a token that merely says it is one gets
 * nowhere.
 */
export function looksLikeDeviceSession(token: string): boolean {
  const decoded = jwt.decode(token, { json: true });
  return decoded?.typ === DEVICE_SESSION_TYPE && decoded?.aud === DEVICE_SESSION_AUDIENCE;
}

export function verifyDeviceSession(token: string, secret: string): DeviceSessionClaims {
  const claims = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: DEVICE_SESSION_ISSUER,
    audience: DEVICE_SESSION_AUDIENCE,
  }) as jwt.JwtPayload;
  if (
    claims.typ !== DEVICE_SESSION_TYPE ||
    typeof claims.sub !== "string" ||
    typeof claims.device_id !== "string"
  ) {
    throw new Error("not a device session");
  }
  return { sub: claims.sub, device_id: claims.device_id, typ: DEVICE_SESSION_TYPE };
}
