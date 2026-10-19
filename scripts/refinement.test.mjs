import test from 'node:test';
import assert from 'node:assert/strict';
import { readAnthropicStream } from '../src/lib/anthropicStream.js';
import { getApiKey, setWorkspaceApiKey, clearApiCredentials } from '../src/lib/apiCredentials.js';
import { callAnthropicStream } from '../src/lib/llm.js';
import { aggregateSessionRisk } from '../src/lib/risk.js';
import { SESSION_AGENT_RESET } from '../src/lib/sessionReset.js';
import { loadWorkspace, saveWorkspaceKey } from './fixtures/workspaceLifecycleLegacy.js';

const event = (data) => `data: ${JSON.stringify(data)}\n\n`;
const delta = text => event({ type: 'content_block_delta', delta: { type: 'text_delta', text } });
const stop = event({ type: 'message_stop' });
function mockStorage(t, storage) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
}
function stream(chunks) {
  return new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
    controller.close();
  } });
}

test('complete stream preserves chunked Unicode and calls completion once', async () => {
  const bytes = new TextEncoder().encode(delta('risk → mitigation') + stop);
  const body = stream([...bytes].map(b => new Uint8Array([b])));
  const tokens = [];
  let done = 0;
  assert.equal(await readAnthropicStream(body, { onToken: text => tokens.push(text), onDone: () => done++ }), 'risk → mitigation');
  assert.deepEqual(tokens, ['risk → mitigation']);
  assert.equal(done, 1);
  assert.equal(body.locked, false);
});

test('stream processes a terminal event without a trailing newline', async () => {
  assert.equal(await readAnthropicStream(stream([delta('result'), 'data: {"type":"message_stop"}'])), 'result');
});

test('premature EOF never calls completion', async () => {
  let done = false;
  const body = stream([delta('partial')]);
  await assert.rejects(readAnthropicStream(body, { onDone: () => { done = true; } }), /ended before/);
  assert.equal(done, false);
  assert.equal(body.locked, false);
});

test('provider error rejects and releases the reader', async () => {
  const body = stream([delta('partial'), event({ type: 'error', error: { message: 'Overloaded' } })]);
  await assert.rejects(readAnthropicStream(body), /Overloaded/);
  assert.equal(body.locked, false);
});

test('malformed events and token callback failures are not swallowed', async () => {
  await assert.rejects(readAnthropicStream(stream(['data: {invalid}\n', stop])), SyntaxError);
  await assert.rejects(readAnthropicStream(stream([delta('text'), stop]), { onToken: () => { throw new Error('UI callback failed'); } }), /UI callback failed/);
});

test('network failure rejects without completion and releases the reader', async () => {
  let done = false;
  const body = new ReadableStream({ pull(controller) { controller.error(new Error('Connection lost')); } });
  await assert.rejects(readAnthropicStream(body, { onDone: () => { done = true; } }), /Connection lost/);
  assert.equal(done, false);
  assert.equal(body.locked, false);
});

test('AI request uses active workspace key and rejects interrupted response', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers['x-api-key'], 'workspace-key');
    return new Response(stream([delta('unfinished')]));
  });
  mockStorage(t, { getItem: () => null });
  setWorkspaceApiKey('workspace-key');
  try {
    await assert.rejects(callAnthropicStream({ messages: [] }), /ended before/);
  } finally { clearApiCredentials(); }
});

test('credentials do not fall back to the previous browser key', async t => {
  let removed;
  mockStorage(t, { getItem: () => 'previous-user-key', removeItem: key => { removed = key; } });
  setWorkspaceApiKey('account-a-key');
  assert.equal(getApiKey(), 'account-a-key');
  clearApiCredentials();
  assert.equal(removed, 'agd_anthropic_key');
  assert.equal(getApiKey(), '');
  setWorkspaceApiKey('account-b-key');
  setWorkspaceApiKey(null);
  assert.equal(getApiKey(), '');
});

test('credential cleanup works when browser storage is blocked', t => {
  mockStorage(t, { removeItem() { throw new Error('Storage blocked'); } });
  setWorkspaceApiKey('secret');
  clearApiCredentials();
  assert.equal(getApiKey(), '');
});

test('confidence aggregation preserves zero, missing, and full confidence', () => {
  const row = { round1_likelihood: 5, round1_impact: 5, round1_severity: 'CRITICAL' };
  assert.equal(aggregateSessionRisk([{ ...row, round1_confidence: 0 }]).avgExposure, 0);
  assert.equal(aggregateSessionRisk([row]).avgExposure, 15);
  assert.equal(aggregateSessionRisk([{ ...row, round1_confidence: 100 }]).avgExposure, 25);
});

test('reset drops old risk and a partial rerun uses fresh round-one ratings', () => {
  const old = { round1_likelihood: 5, round1_impact: 5, round2_likelihood: 4, round2_impact: 5, round2_confidence: 100, round2_revised_severity: 'CRITICAL', round2_rebuttal: 'old assessment' };
  const reset = { ...old, ...SESSION_AGENT_RESET };
  assert.equal(aggregateSessionRisk([reset]), null);
  assert.equal(reset.round2_rebuttal, null);
  assert.equal(aggregateSessionRisk([{ ...reset, round1_likelihood: 2, round1_impact: 2, round1_confidence: 100, round1_severity: 'LOW', round1_assessment: 'new assessment' }]).peak, 4);
});

function clientFor(results) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, operations: [] };
    calls.push(call);
    const builder = {};
    for (const method of ['upsert', 'select', 'eq', 'in', 'insert', 'update', 'single']) {
      builder[method] = (...args) => { call.operations.push([method, ...args]); return builder; };
    }
    builder.then = (resolve, reject) => {
      if (!results.length) return Promise.reject(new Error('Unexpected query')).then(resolve, reject);
      return Promise.resolve(results.shift()).then(resolve, reject);
    };
    return builder;
  } };
}
const ok = data => ({ data, error: null });
const fail = message => ({ data: null, error: { message } });

test('workspace membership failure stops initialization without creating a workspace', async () => {
  const client = clientFor([ok(null), fail('Network unavailable')]);
  await assert.rejects(loadWorkspace(client, 'user'), /membership: Network unavailable/);
  assert.deepEqual(client.calls.map(c => c.table), ['profiles', 'workspace_members']);
});

test('workspace reads and profile failures surface instead of triggering creation', async () => {
  for (const results of [[fail('Profile failed')], [ok(null), ok([{ workspace_id: 'ws' }]), fail('Read failed')], [ok(null), ok([]), fail('Owner read failed')]]) {
    const client = clientFor(results);
    await assert.rejects(loadWorkspace(client, 'user'), /failed/i);
    assert.equal(client.calls.some(c => c.operations.some(o => o[0] === 'insert')), false);
  }
});

test('workspace selection respects membership and preferred workspace', async () => {
  const client = clientFor([ok(null), ok([{ workspace_id: 'a' }, { workspace_id: 'b' }]), ok([{ id: 'a' }, { id: 'b' }])]);
  assert.equal((await loadWorkspace(client, 'user', 'b')).id, 'b');
});

test('missing readable workspace does not create a duplicate', async () => {
  const client = clientFor([ok(null), ok([{ workspace_id: 'ws' }]), ok([])]);
  await assert.rejects(loadWorkspace(client, 'user'), /could not be loaded/);
  assert.equal(client.calls.length, 3);
});

test('initialization repairs an owned workspace without creating another', async () => {
  const client = clientFor([ok(null), ok([]), ok([{ id: 'owned' }]), ok(null)]);
  assert.equal((await loadWorkspace(client, 'user')).id, 'owned');
  assert.equal(client.calls.filter(c => c.table === 'workspaces').length, 1);
  assert.deepEqual(client.calls.at(-1).operations[0], ['insert', { workspace_id: 'owned', user_id: 'user', role: 'admin' }]);
});

test('workspace creation and membership errors reject, allowing a later retry', async () => {
  const failed = clientFor([ok(null), ok([]), ok([]), ok({ id: 'new' }), fail('Join failed')]);
  await assert.rejects(loadWorkspace(failed, 'user'), /Join failed/);
  const retry = clientFor([ok(null), ok([]), ok([{ id: 'new' }]), ok(null)]);
  assert.equal((await loadWorkspace(retry, 'user')).id, 'new');
});

test('cancelled initialization stops before further queries or writes', async () => {
  const client = clientFor([ok(null)]);
  let checks = 0;
  await assert.rejects(loadWorkspace(client, 'user', null, () => ++checks < 2), /cancelled/);
  assert.equal(client.calls.length, 1);
});

test('key save requires a returned workspace row, including RLS no-op updates', async () => {
  await assert.rejects(saveWorkspaceKey(clientFor([fail('No rows')]), 'ws', 'key'), /No rows/);
  await assert.rejects(saveWorkspaceKey(clientFor([ok(null)]), 'ws', 'key'), /not saved/);
  const client = clientFor([ok({ id: 'ws', anthropic_api_key: 'key' })]);
  assert.equal((await saveWorkspaceKey(client, 'ws', ' key ')).anthropic_api_key, 'key');
  assert.deepEqual(client.calls[0].operations[0], ['update', { anthropic_api_key: 'key' }]);
});
