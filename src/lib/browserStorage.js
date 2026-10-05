// Per-tab conveniences kept in sessionStorage (R-N10): the active tab of a
// session workspace and an unsent facilitator note. Storage can be blocked
// (private mode, cleared site data), so every access reports failure instead
// of throwing; callers treat a false/null result as "not remembered".

export function sessionGet(key) {
  try { return sessionStorage.getItem(key); }
  catch (e) { return null; }      // storage blocked: nothing remembered
}

export function sessionSet(key, value) {
  try { sessionStorage.setItem(key, value); return true; }
  catch (e) { return false; }     // storage blocked: draft is simply not kept
}

export function sessionRemove(key) {
  try { sessionStorage.removeItem(key); return true; }
  catch (e) { return false; }
}
