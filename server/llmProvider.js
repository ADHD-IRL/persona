const fail = (status, message) => Object.assign(new Error(message), { status });
export function providerConfig(env = {}) {
  const provider = env.LLM_PROVIDER || 'anthropic';
  if (!['anthropic', 'mitre_aip'].includes(provider)) throw new Error('LLM_PROVIDER must be anthropic or mitre_aip.');
  const baseUrl = (env.MITRE_AIP_BASE_URL || 'https://models.k8s.aip.mitre.org/v1').replace(/\/+$/, '');
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('MITRE_AIP_BASE_URL must be an HTTPS URL without credentials, query, or fragment.');
  const tokenField = env.MITRE_AIP_TOKEN_LIMIT_FIELD || 'max_tokens';
  if (!['max_tokens', 'max_completion_tokens'].includes(tokenField)) throw new Error('Unsupported MITRE_AIP_TOKEN_LIMIT_FIELD.');
  const maxTokens = Number(env.LLM_MAX_TOKENS || 8192);
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error('LLM_MAX_TOKENS must be a positive integer.');
  return Object.freeze({ provider, baseUrl, apiKey: env.MITRE_AIP_API_KEY || '', defaultModel: env.MITRE_AIP_MODEL || '', supportsTools: env.MITRE_AIP_SUPPORTS_TOOLS === 'true', includeUsage: env.MITRE_AIP_STREAM_USAGE !== 'false', tokenField, maxTokens });
}

export function publicConfig(config) {
  return { provider: config.provider, configured: config.provider === 'anthropic' || !!config.apiKey, defaultModel: config.provider === 'mitre_aip' ? config.defaultModel : '', supportsTools: config.provider === 'anthropic' || config.supportsTools, usageReporting: config.provider === 'mitre_aip' ? config.includeUsage : true };
}

export function normalizeUsage(usage) {
  if (!usage || !Number.isFinite(usage.prompt_tokens) || !Number.isFinite(usage.completion_tokens)) return null;
  return { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens };
}

export function toOpenAIRequest(input, config, model) {
  if (!Array.isArray(input.messages) || !input.messages.length) throw fail(400, 'At least one message is required.');
  const maxTokens = input.max_tokens ?? 2000;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > config.maxTokens) throw fail(400, `Token limit must be between 1 and ${config.maxTokens}.`);
  const messages = [];
  if (input.system) {
    if (typeof input.system !== 'string') throw fail(400, 'System instructions must be text.');
    messages.push({ role: 'system', content: input.system });
  }
  for (const message of input.messages) {
    if (!message || typeof message !== 'object') throw fail(400, 'Invalid message.');
    if (!['user', 'assistant'].includes(message.role)) throw fail(400, 'Unsupported message role.');
    if (typeof message.content === 'string') { messages.push({ role: message.role, content: message.content }); continue; }
    if (!Array.isArray(message.content)) throw fail(400, 'Unsupported message content.');
    const text = [], tools = [];
    for (const block of message.content) {
      if (block.type === 'text' && typeof block.text === 'string') text.push(block.text);
      else if (block.type === 'tool_use' && message.role === 'assistant' && block.id && block.name) tools.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input || {}) } });
      else if (block.type === 'tool_result' && message.role === 'user' && block.tool_use_id) messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content) });
      else throw fail(400, 'Unsupported message block.');
    }
    if (text.length || tools.length) messages.push({ role: message.role, content: text.length ? text.join('\n') : null, ...(tools.length ? { tool_calls: tools } : {}) });
  }
  const result = { model, messages, [config.tokenField]: maxTokens, stream: input.stream === true };
  if (input.tools?.length) {
    if (!config.supportsTools) throw fail(400, 'Tool-enabled replies are not enabled for this AIP model. Confirm model support and set MITRE_AIP_SUPPORTS_TOOLS=true on the server.');
    if (input.stream) throw fail(400, 'Use non-streaming requests for tool-enabled replies.');
    result.tools = input.tools.map(tool => {
      if (typeof tool.name !== 'string' || !tool.input_schema) throw fail(400, 'Invalid tool definition.');
      return { type: 'function', function: { name: tool.name, description: tool.description || '', parameters: tool.input_schema } };
    });
  }
  if (messages.some(message => message.tool_calls || message.role === 'tool') && !config.supportsTools) throw fail(400, 'This AIP model is not configured for tool calls.');
  if (result.stream && config.includeUsage) result.stream_options = { include_usage: true };
  return result;
}

function checkFinish(reason, tools = false) {
  if (reason === 'length') throw Object.assign(fail(502, 'The model reached its token limit before completing the response.'), { kind: 'output_limit' });
  if (reason === 'content_filter') throw fail(502, 'The model declined the response under its content policy.');
  if (reason !== 'stop' && !(tools && reason === 'tool_calls')) throw fail(502, 'The provider did not report a supported completion state.');
}
export function normalizeCompletion(data, model) {
  const choice = data?.choices?.[0];
  if (!choice?.message) throw fail(502, 'The provider returned no completion.');
  checkFinish(choice.finish_reason, true);
  const content = [];
  if (typeof choice.message.content === 'string' && choice.message.content.trim()) content.push({ type: 'text', text: choice.message.content });
  for (const call of choice.message.tool_calls || []) {
    let input;
    try { input = JSON.parse(call.function.arguments); } catch { throw fail(502, 'The provider returned malformed tool arguments.'); }
    if (!input || Array.isArray(input) || typeof input !== 'object' || !call.id || !call.function.name) throw fail(502, 'The provider returned an invalid tool call.');
    content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
  }
  if (!content.length) throw fail(502, 'The provider returned an empty response.');
  if (choice.finish_reason === 'tool_calls' && !content.some(block => block.type === 'tool_use')) throw fail(502, 'The provider reported tool calls without any tools.');
  return { id: data.id, model: data.model || model, content, stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn', usage: normalizeUsage(data.usage) };
}

// Read SSE events across arbitrary network/UTF-8 boundaries and retain final
// buffered events. The caller decides which terminal event proves completion.
export async function* sseData(body, signal) {
  if (!body) throw fail(502, 'The provider returned an empty stream.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', lines = [];
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const completeLines = buffer.split('\n');
      buffer = completeLines.pop();
      if (done && buffer) completeLines.push(buffer);
      for (let line of completeLines) {
        line = line.replace(/\r$/, '');
        if (!line) { if (lines.length) yield lines.join('\n'); lines = []; }
        else if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
      }
      if (done) { if (lines.length) yield lines.join('\n'); break; }
      if (buffer.length > 1024 * 1024 || lines.join('').length > 1024 * 1024) throw fail(502, 'Provider stream event is too large.');
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await reader.cancel(); } catch { /* preserve original error */ }
    reader.releaseLock();
  }
}

export function createLLMProvider(config, fetchUpstream = fetch) {
  let cachedModels = null;
  const redact = value => String(value).replaceAll(config.apiKey || '\0', '[redacted]').slice(0, 500);
  function configured() { if (!config.apiKey) throw fail(503, 'Configure MITRE_AIP_API_KEY on the Node server.'); }
  async function upstream(path, options = {}) {
    configured();
    let response;
    try { response = await fetchUpstream(`${config.baseUrl}/${path}`, { ...options, redirect: 'error', headers: { ...options.headers, Authorization: `Bearer ${config.apiKey}` } }); }
    catch (error) {
      if (options.signal?.aborted) throw error;
      throw fail(502, 'Could not reach MITRE AIP. Check VPN/DNS access and the Node certificate trust configuration.');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data?.error?.message || data?.error || `MITRE AIP returned HTTP ${response.status}.`;
      throw fail(response.status >= 400 && response.status <= 599 ? response.status : 502, redact(message));
    }
    return response;
  }
  async function listModels(signal) {
    if (cachedModels && cachedModels.until > Date.now()) return [...cachedModels.ids];
    const response = await upstream('models', { signal });
    const data = await response.json().catch(() => null);
    const ids = [...new Set((data?.data || []).map(item => item.id).filter(id => typeof id === 'string' && id.trim()))].sort();
    if (!ids.length) throw fail(502, 'MITRE AIP listed no accessible models.');
    cachedModels = { ids, until: Date.now() + 60000 };
    return [...ids];
  }
  async function request(input, signal) {
    configured();
    if (!input || Array.isArray(input) || typeof input !== 'object') throw fail(400, 'Expected a model request object.');
    const model = input.model || config.defaultModel;
    if (typeof model !== 'string' || !model) throw fail(400, 'Select an AIP model in Settings or set MITRE_AIP_MODEL on the server.');
    if (model !== config.defaultModel && !(await listModels(signal)).includes(model)) throw fail(400, 'The selected model is not available from MITRE AIP. Refresh the model list.');
    const body = toOpenAIRequest(input, config, model);
    const response = await upstream('chat/completions', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { response, model };
  }
  async function completeOnce(input, signal) {
    const { response, model } = await request({ ...input, stream: false }, signal);
    const data = await response.json().catch(() => null);
    if (data?.error) throw fail(502, redact(data.error.message || data.error));
    return normalizeCompletion(data, model);
  }
  async function* streamOnce(input, signal) {
    const { response, model } = await request({ ...input, stream: true }, signal);
    yield { type: 'message_start', message: { model, provider: 'mitre_aip' } };
    let finished = false, reason = null, usage = null, hasText = false;
    for await (const raw of sseData(response.body, signal)) {
      if (raw.trim() === '[DONE]') { finished = true; break; }
      let data;
      try { data = JSON.parse(raw); } catch { throw fail(502, 'The provider returned a malformed stream event.'); }
      if (data.error) throw fail(502, redact(data.error.message || data.error));
      if (data.usage) usage = normalizeUsage(data.usage);
      const choice = data.choices?.[0];
      if (choice?.delta?.tool_calls) throw fail(502, 'Unexpected streamed tool call. Use the non-streaming tool workflow.');
      const text = choice?.delta?.content;
      if (typeof text === 'string' && text) {
        hasText = true;
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
      }
      if (choice?.finish_reason) reason = choice.finish_reason;
    }
    if (!finished) throw fail(502, 'MITRE AIP stream ended before its completion event. Please retry.');
    checkFinish(reason);
    if (!hasText) throw fail(502, 'The provider returned an empty response.');
    yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage };
    yield { type: 'message_stop' };
  }
  function nextBudget(input, attempt, error) {
    const current = input.max_tokens ?? 2000;
    if (error.kind !== 'output_limit') throw error;
    if (attempt >= 2 || current >= config.maxTokens) throw Object.assign(fail(502, 'The model reached its token limit after bounded recovery. Completed responses remain saved. Increase the verified model output allowance on the server, then resume; no input was shortened.'), { kind: 'output_limit' });
    return Math.min(config.maxTokens, current * 2);
  }
  async function complete(input, signal, onRecovery) {
    let requestInput = input;
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try { const result = await completeOnce(requestInput, signal); await onRecovery?.(null); return result; }
      catch (error) {
        signal?.throwIfAborted();
        const max_tokens = nextBudget(requestInput, attempt, error);
        await onRecovery?.({ attempt: attempt + 1, max_tokens, message: 'Response reached its output limit. Retrying this step with more capacity; the complete input and saved debate steps are retained.' });
        requestInput = { ...input, max_tokens };
      }
    }
  }
  async function* stream(input, signal) {
    let requestInput = input;
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try { yield* streamOnce(requestInput, signal); return; }
      catch (error) {
        signal?.throwIfAborted();
        const max_tokens = nextBudget(requestInput, attempt, error);
        yield { type: 'response_retry', attempt: attempt + 1, max_tokens, message: 'Retrying with more output capacity. The incomplete response is being replaced.' };
        requestInput = { ...input, max_tokens };
      }
    }
  }
  return { config: publicConfig(config), listModels, complete, stream };
}
