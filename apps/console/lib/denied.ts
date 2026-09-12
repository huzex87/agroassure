/**
 * The prefix a role refusal is recognised by.
 *
 * Its own file because both sides of the boundary need it: lib/api stamps it
 * onto the error on the server, app/error reads it back in the browser, and
 * lib/api reaches for next/headers — which cannot be pulled into a client
 * bundle, so importing the constant from there took the whole module with it
 * and the build refused.
 */
export const DENIED = "role-denied";
