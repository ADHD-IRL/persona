// Credentials belong only to the active workspace, never to a browser profile.
let workspaceApiKey = '';

export function setWorkspaceApiKey(key) {
  workspaceApiKey = key || '';
}

export function getApiKey() {
  return workspaceApiKey;
}

export function clearApiCredentials() {
  workspaceApiKey = '';
  // Discard legacy unscoped credentials without assigning them to a new user.
  try { globalThis.localStorage?.removeItem('agd_anthropic_key'); } catch { /* storage may be blocked */ }
}
