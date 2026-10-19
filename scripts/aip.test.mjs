import test from 'node:test';
import assert from 'node:assert/strict';
import { providerConfig, publicConfig, createLLMProvider, toOpenAIRequest, normalizeCompletion } from '../server/llmProvider.js';
import { createApp } from '../server/app.js';
import { readAnthropicStream } from '../src/lib/anthropicStream.js';
import { setProviderConfig, setWorkspaceApiKey, clearApiCredentials } from '../src/lib/apiCredentials.js';
import { callAnthropicStream, generateAgentReplyWithTools, setKnowledgeRetriever, setUsageSink, getModelId } from '../src/lib/llm.js';
const ws = '10000000-0000-0000-0000-000000000001';
const config = providerConfig({ LLM_PROVIDER: 'mitre_aip', MITRE_AIP_API_KEY: 'server-only-key', MITRE_AIP_MODEL: 'aip-model', MITRE_AIP_SUPPORTS_TOOLS: 'true' });
const input = { model: 'aip-model', max_tokens: 200, messages: [{ role: 'user', content: 'Question' }] };
const event = data => `data: ${JSON.stringify(data)}\n\n`;
const delta = text => event({ choices: [{ delta: { content: text }, finish_reason: null }] });
const finished = event({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n';
const result = content => ({ choices: [{ message: { content }, finish_reason: 'stop' }], model: 'aip-model', usage: { prompt_tokens: 10, completion_tokens: 3 } });
async function collect(generator) { const values = []; for await (const value of generator) values.push(value); return values; }

test('AIP configuration exposes status and capabilities without exposing credentials', () => {
  assert.equal(publicConfig(config).configured, true);
  assert.ok(!JSON.stringify(publicConfig(config)).includes('server-only-key'));
  assert.throws(() => providerConfig({ LLM_PROVIDER: 'bad' }));
  assert.throws(() => providerConfig({ MITRE_AIP_BASE_URL: 'http://insecure.test/v1' }));
  assert.throws(() => providerConfig({ MITRE_AIP_BASE_URL: 'https://user:password@test/v1' }));
  assert.throws(() => providerConfig({ MITRE_AIP_TOKEN_LIMIT_FIELD: 'arbitrary' }));
});
test('AIP uses server bearer authentication for model discovery and caches IDs', async () => {
  let count = 0;
  const provider = createLLMProvider(config, async (url, options) => {
    count++; assert.ok(url.endsWith('/models'));
    assert.equal(options.headers.Authorization, 'Bearer server-only-key');
    assert.equal(options.redirect, 'error');
    return Response.json({ data: [{ id: 'z' }, { id: 'a' }, { id: 'a' }] });
  });
  assert.deepEqual(await provider.listModels(), ['a', 'z']);
  assert.deepEqual(await provider.listModels(), ['a', 'z']);
  assert.equal(count, 1);
});
test('missing credentials never fall back to Anthropic', async () => {
  const provider = createLLMProvider(providerConfig({ LLM_PROVIDER: 'mitre_aip' }), () => { throw new Error('Unexpected network call'); });
  await assert.rejects(provider.complete(input), /MITRE_AIP_API_KEY/);
});
test('model errors redact bearer keys and preserve provider status', async () => {
  const provider = createLLMProvider(config, async () => Response.json({ error: { message: 'Invalid server-only-key' } }, { status: 401 }));
  await assert.rejects(provider.listModels(), error => error.status === 401 && !error.message.includes('server-only-key'));
});
test('unavailable models are rejected before completion is sent', async () => {
  const provider = createLLMProvider(config, async url => { assert.ok(url.endsWith('/models')); return Response.json({ data: [{ id: 'available' }] }); });
  await assert.rejects(provider.complete({ ...input, model: 'not-listed' }), /not available/);
});
test('system messages, token parameter, tool definitions, and results are translated', () => {
  const body = toOpenAIRequest({ ...input, system: 'Instructions', tools: [{ name: 'search', description: 'Find facts', input_schema: { type: 'object' } }], messages: [
    ...input.messages,
    { role: 'assistant', content: [{ type: 'text', text: 'Checking' }, { type: 'tool_use', id: 'call-1', name: 'search', input: { query: 'q' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'Facts' }] },
  ] }, { ...config, tokenField: 'max_completion_tokens' }, 'aip-model');
  assert.equal(body.max_completion_tokens, 200); assert.equal(body.max_tokens, undefined);
  assert.deepEqual(body.messages[0], { role: 'system', content: 'Instructions' });
  assert.equal(body.tools[0].function.name, 'search');
  assert.deepEqual(body.messages[2].tool_calls[0].function, { name: 'search', arguments: '{"query":"q"}' });
  assert.deepEqual(body.messages[3], { role: 'tool', tool_call_id: 'call-1', content: 'Facts' });
});
test('unsupported tools and unsupported content fail explicitly', () => {
  assert.throws(() => toOpenAIRequest({ ...input, tools: [{ name: 'search', input_schema: {} }] }, { ...config, supportsTools: false }, 'm'), /not enabled/);
  assert.throws(() => toOpenAIRequest({ ...input, messages: [{ role: 'user', content: [{ type: 'image' }] }] }, config, 'm'), /Unsupported/);
  assert.throws(() => toOpenAIRequest({ ...input, max_tokens: 999999 }, config, 'm'), /Token limit/);
  assert.throws(() => toOpenAIRequest({ ...input, messages: [null] }, config, 'm'), /Invalid message/);
});
test('completion normalizes text, usage, and tool calls', () => {
  assert.deepEqual(normalizeCompletion(result('Answer'), 'm').usage, { input_tokens: 10, output_tokens: 3 });
  const toolResult = normalizeCompletion({ choices: [{ message: { content: null, tool_calls: [{ id: 'id', function: { name: 'search', arguments: '{"query":"q"}' } }] }, finish_reason: 'tool_calls' }] }, 'm');
  assert.equal(toolResult.stop_reason, 'tool_use');
  assert.deepEqual(toolResult.content[0].input, { query: 'q' });
  assert.equal(toolResult.usage, null);
  assert.throws(() => normalizeCompletion({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }, 'm'), /token limit/);
  assert.throws(() => normalizeCompletion({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }, 'm'), /empty response/);
  assert.throws(() => normalizeCompletion({ choices: [{ message: { tool_calls: [{ id: 'bad', function: { name: 'search', arguments: '{broken}' } }] }, finish_reason: 'tool_calls' }] }, 'm'), /malformed tool arguments/);
});
test('AIP streaming requires DONE and a successful finish reason', async () => {
  for (const body of [delta('Partial'), delta('Partial') + event({ error: { message: 'Rejected' } }) + finished, delta('Partial') + event({ choices: [{ delta: {}, finish_reason: 'length' }] }) + 'data: [DONE]\n\n']) {
    const provider = createLLMProvider(config, async () => new Response(body));
    await assert.rejects(collect(provider.stream(input)));
  }
});
test('AIP stream normalizes usage and Unicode across byte boundaries', async () => {
  const bytes = new TextEncoder().encode(delta('Result → answer') + event({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + event({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 4 } }) + 'data: [DONE]');
  const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const provider = createLLMProvider(config, async () => new Response(body));
  const events = await collect(provider.stream(input));
  assert.equal(events.at(-1).type, 'message_stop');
  assert.deepEqual(events.at(-2).usage, { input_tokens: 12, output_tokens: 4 });
  assert.equal(events.find(item => item.type === 'content_block_delta').delta.text, 'Result → answer');
  assert.equal(body.locked, false);
});
test('cancellation interrupts pending AIP reads and releases the stream reader', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(delta('partial'))); }, cancel() { cancelled = true; } });
  const provider = createLLMProvider(config, async () => new Response(body));
  const controller = new AbortController();
  const iterator = provider.stream(input, controller.signal);
  await iterator.next(); await iterator.next();
  const pending = iterator.next();
  controller.abort();
  await assert.rejects(pending);
  assert.equal(cancelled, true); assert.equal(body.locked, false);
});
test('the normalized browser reader rejects token-limit termination', async () => {
  await assert.rejects(readAnthropicStream(new Response(event({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }) + event({ type: 'message_stop' })).body), /token limit/);
});

test('AIP Node endpoints and browser tool workflow', async t => {
  // PostgreSQL membership and cookie persistence are covered by postgres.test.
  // This fixture isolates the new authenticated provider boundary.
  const user = { id: 'user-id', email: 'user@example.test' };
  const pool = {
    async query(sql) { assert.ok(sql.includes('FROM local_sessions')); return { rows: [user] }; },
    async connect() { return { async query(sql, values) { return { rows: sql.includes('FROM workspace_members') ? (values[0] === ws ? [{ role: 'admin' }] : []) : [] }; }, release() {} }; },
  };
  const sent = [];
  let mode = 'text';
  const server = createApp({ pool, llmConfig: config, fetchUpstream: async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer server-only-key');
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'aip-model' }, { id: 'other-model' }] });
    const body = JSON.parse(options.body); sent.push(body);
    if (mode === 'broken') return new Response(delta('partial'));
    if (body.stream) return new Response(delta('answer') + finished);
    if (mode === 'tool' && body.tools && !body.messages.some(message => message.role === 'tool')) return Response.json({ choices: [{ message: { content: null, tool_calls: [{ id: 'tool-1', function: { name: 'search_knowledge', arguments: '{"query":"context"}' } }] }, finish_reason: 'tool_calls' }] });
    return Response.json(result('Evidence-based answer'));
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = 'agd_session=fixture';
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'x-workspace-id': ws };
  try {
    await t.test('config and discovery require membership and never return the key', async () => {
      assert.equal((await fetch(base + '/api/llm/config?workspace_id=' + ws)).status, 401);
      const response = await fetch(base + '/api/llm/config?workspace_id=' + ws, { headers });
      assert.equal(response.status, 200); assert.ok(!(await response.text()).includes('server-only-key'));
      const models = await (await fetch(base + '/api/llm/models?workspace_id=' + ws, { headers })).json();
      assert.deepEqual(models.models, ['aip-model', 'other-model']);
      assert.equal((await fetch(base + '/api/llm/models?workspace_id=10000000-0000-0000-0000-000000000002', { headers })).status, 403);
    });
    await t.test('messages accept no browser key and ignore injected provider endpoints', async () => {
      const response = await fetch(base + '/api/llm/messages', { method: 'POST', headers, body: JSON.stringify({ ...input, baseUrl: 'https://untrusted.test', apiKey: 'browser-key' }) });
      assert.equal(response.status, 200); assert.equal((await response.json()).content[0].text, 'Evidence-based answer');
      assert.ok(!JSON.stringify(sent.at(-1)).includes('browser-key'));
    });
    await t.test('normalized streamed errors do not call the browser completion callback', async () => {
      mode = 'broken';
      const response = await fetch(base + '/api/llm/messages', { method: 'POST', headers, body: JSON.stringify({ ...input, stream: true }) });
      let completed = false;
      await assert.rejects(readAnthropicStream(response.body, { onDone: () => { completed = true; } }), /completion event/);
      assert.equal(completed, false); mode = 'text';
    });
    await t.test('legacy route also uses AIP, preventing an Anthropic bypass', async () => {
      const response = await fetch(base + '/api/anthropic', { method: 'POST', headers, body: JSON.stringify(input) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).model, 'aip-model');
    });
    await t.test('existing frontend text and multi-step tool helpers work with AIP', async inner => {
      const originalFetch = globalThis.fetch;
      const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
      inner.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; clearApiCredentials(); setKnowledgeRetriever(null); setUsageSink(null); });
      inner.mock.method(globalThis, 'fetch', (url, options = {}) => originalFetch(new URL(url, base), { ...options, headers: { ...options.headers, Cookie: cookie } }));
      setWorkspaceApiKey('', ws); setProviderConfig(publicConfig(config));
      assert.equal(getModelId(), 'aip-model');
      let usage;
      setUsageSink(value => { usage = value; });
      assert.equal(await callAnthropicStream({ messages: input.messages }), 'answer');
      mode = 'tool';
      setKnowledgeRetriever(async () => [{ title: 'Local reference', content: 'Verified context' }]);
      const answer = await generateAgentReplyWithTools({ agent: { name: 'Expert', persona_description: 'A systems expert' }, question: 'Assess this', priorMessages: [], scenarioContext: 'context' });
      assert.equal(answer.text, 'Evidence-based answer'); assert.equal(answer.toolCalls.length, 1);
      assert.ok(sent.at(-1).messages.some(message => message.role === 'tool' && message.tool_call_id === 'tool-1'));
      assert.equal(usage.provider, 'mitre_aip'); assert.equal(usage.input_tokens, 10);
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
