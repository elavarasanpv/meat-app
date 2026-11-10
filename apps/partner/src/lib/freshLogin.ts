/**
 * Set by the login screen as it verifies a code (before, not after: Supabase
 * announces the session mid-call, which mounts the role gate), read once by
 * that gate: the welcome screen shows after signing in, not on every app open.
 */
let fresh = false;
export const markFreshLogin = () => { fresh = true; };
export const clearFreshLogin = () => { fresh = false; };
export function takeFreshLogin() {
  const was = fresh;
  fresh = false;
  return was;
}
