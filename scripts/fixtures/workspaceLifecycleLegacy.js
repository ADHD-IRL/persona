function checked(result, action) {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data;
}

// A failed read is never evidence that a workspace needs to be created.
// isCurrent prevents an abandoned initialization from continuing to write.
export async function loadWorkspace(client, userId, preferredId, isCurrent = () => true) {
  const ensureCurrent = () => {
    if (!isCurrent()) throw new Error('Workspace initialization cancelled.');
  };
  ensureCurrent();
  checked(await client.from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true }), 'Unable to initialize your profile');
  ensureCurrent();
  const members = checked(await client.from('workspace_members').select('workspace_id, role').eq('user_id', userId), 'Unable to load workspace membership');
  ensureCurrent();
  if (members?.length) {
    const workspaces = checked(await client.from('workspaces').select('*').in('id', members.map(m => m.workspace_id)), 'Unable to load your workspaces');
    ensureCurrent();
    const ws = workspaces?.find(w => w.id === preferredId) ?? workspaces?.[0];
    if (!ws) throw new Error('Your workspace membership exists, but the workspace could not be loaded.');
    return ws;
  }
  const owned = checked(await client.from('workspaces').select('*').eq('owner_id', userId), 'Unable to load owned workspaces');
  ensureCurrent();
  const ws = owned?.[0] ?? checked(await client.from('workspaces').insert({ name: 'My Workspace', owner_id: userId }).select().single(), 'Unable to create your workspace');
  ensureCurrent();
  if (!ws) throw new Error('Workspace creation returned no workspace.');
  checked(await client.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'admin' }), 'Unable to join your workspace');
  ensureCurrent();
  return ws;
}

export async function saveWorkspaceKey(client, workspaceId, key) {
  // Returning the row detects RLS-denied updates that affect zero rows.
  const ws = checked(await client.from('workspaces').update({ anthropic_api_key: key.trim() }).eq('id', workspaceId).select('*').single(), 'Unable to save your workspace API key');
  if (!ws) throw new Error('Your workspace API key was not saved.');
  return ws;
}
