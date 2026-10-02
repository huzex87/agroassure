// Who each part of the console is for. The roles are the gateway's own. The
// menu and the Settings page use these to offer only what a person can open;
// hiding a link decides nothing, because the gateway still checks every request.

export const PLANNERS = ["desk_supervisor", "authorising_officer", "state_admin"];
export const OVERSIGHT = ["desk_supervisor", "authorising_officer", "state_admin", "national_admin", "auditor"];
export const TEAM_ROLES = ["state_admin", "national_admin", "auditor"];
export const PROGRAMME_ROLES = ["state_admin", "national_admin", "auditor", "authorising_officer"];

/** Whether someone holding these roles may see something for `allowed`. Unknown roles see everything. */
export function canSee(roles: string[] | null, allowed?: string[]): boolean {
  return !allowed || !roles || allowed.some((r) => roles.includes(r));
}
