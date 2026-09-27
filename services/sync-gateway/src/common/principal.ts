import type { Role } from "@agroassure/domain";

// The verified caller, derived from a validated bearer token. Handlers use this
// and never trust a role or id asserted in a request body.

export interface Principal {
  userId: string;
  deviceId: string | null; // present for a field device token
  jurisdictionId: string | null;
  roles: Role[];
  /**
   * "device" when the caller is a phone holding the session its invitation
   * gave it. The guard then takes roles and jurisdiction from the database,
   * and refuses the request if the phone has been signed out.
   */
  via?: "device" | "console";
}

// Marker key used to attach the principal to the Express request.
export const PRINCIPAL_KEY = "agroassurePrincipal";
