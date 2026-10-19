export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(path, {
    method, credentials: 'same-origin', signal,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.error || `Server request failed (${response.status}).`), { status: response.status });
  if (data === null) throw new Error('The Node server did not return JSON. Check that it is running.');
  return data;
}
