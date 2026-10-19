let workspaceApiKey = '', activeWorkspaceId = '';
let provider = { provider: 'anthropic' };
export function setWorkspaceApiKey(key, workspaceId = '') { workspaceApiKey = key || ''; activeWorkspaceId = workspaceId || ''; }
export function getApiKey() { return workspaceApiKey; }
export function getActiveWorkspaceId() { return activeWorkspaceId; }
export function setProviderConfig(config) { provider = { ...config }; }
export function getProviderConfig() { return { ...provider }; }
export function clearApiCredentials() {
  workspaceApiKey = ''; activeWorkspaceId = ''; provider = { provider: 'anthropic' };
  try { globalThis.localStorage?.removeItem('agd_anthropic_key'); } catch { /* storage may be blocked */ }
}
