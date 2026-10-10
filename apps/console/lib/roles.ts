// Who each part of the console is for. The roles are the gateway's own. The
// menu and the Settings page use these to offer only what a person can open;
// hiding a link decides nothing, because the gateway still checks every request.

export const PLANNERS = ["desk_supervisor", "authorising_officer", "state_admin"];
export const OVERSIGHT = ["desk_supervisor", "authorising_officer", "state_admin", "national_admin", "auditor"];
export const TEAM_ROLES = ["state_admin", "national_admin", "auditor"];
/** Who runs the server and may see how it is set up. */
export const ADMIN_ROLES = ["state_admin", "national_admin"];
export const PROGRAMME_ROLES = ["state_admin", "national_admin", "auditor", "authorising_officer"];

/**
 * What each role is called on screen. The gateway keeps its own longer names
 * (desk supervisor, state administrator); a person reading a menu needs the
 * short ones, and needs the same one in every place.
 */
export const ROLE_LABEL: Record<string, string> = {
  national_admin: "National administrator",
  state_admin: "Administrator",
  authorising_officer: "Authorising officer",
  desk_supervisor: "Reviewer",
  auditor: "Auditor",
  inspector: "Inspector",
};

/**
 * The line under a person's name: what they are, and for a state role, where.
 * A national administrator's record still names a state, but they work across
 * all of them, so saying that state would be wrong.
 */
export function accountLine(roles: string[], jurisdictionName: string | null): string {
  if (roles.includes("national_admin")) return ROLE_LABEL.national_admin!;
  const role = roles.map((r) => ROLE_LABEL[r]).find(Boolean) ?? null;
  return [role, jurisdictionName].filter(Boolean).join(" · ") || "Signed in";
}

/** Whether someone holding these roles may see something for `allowed`. Unknown roles see everything. */
export function canSee(roles: string[] | null, allowed?: string[]): boolean {
  return !allowed || !roles || allowed.some((r) => roles.includes(r));
}
