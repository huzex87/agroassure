// FIRST_ADMIN_*: who the deployment's owner is, read at boot. What is done with
// it lives in registration/first-admin.service.ts.

export interface FirstAdminConfig {
  email: string;
  name: string;
  state: string;
  stateCode: string;
}

/** A short code for a state, from its name: "Kano State" → "KANO". */
export function stateCodeFor(name: string): string {
  const code = name
    .toUpperCase()
    .replace(/\bSTATE\b/g, "")
    .replace(/[^A-Z]/g, "")
    .slice(0, 12);
  return code || "STATE";
}

export function loadFirstAdmin(env: NodeJS.ProcessEnv): FirstAdminConfig | null {
  const email = env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("FIRST_ADMIN_EMAIL is not an email address");
  }
  const state = env.FIRST_ADMIN_STATE?.trim() || "Katsina State";
  return {
    email,
    name: env.FIRST_ADMIN_NAME?.trim() || email.split("@")[0]!,
    state,
    stateCode: env.FIRST_ADMIN_STATE_CODE?.trim().toUpperCase() || stateCodeFor(state),
  };
}
