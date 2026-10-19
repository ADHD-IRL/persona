// Both server providers expose this normalized event contract.
export async function readAnthropicStream(body, { onToken, onDone, onUsage, onRecovery, signal } = {}) {
  if (!body) throw new Error('The model returned an empty response stream.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', fullText = '', complete = false, usage = null;
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  function processLine(line) {
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    const event = JSON.parse(raw);
    if (event.type === 'error') throw new Error(event.error?.message || 'The model returned a stream error.');
    if (event.type === 'response_retry') { fullText = ''; usage = null; onToken?.('', ''); onRecovery?.(event); }
    if (event.type === 'message_start' && event.message?.usage) usage = { ...event.message.usage };
    if (event.type === 'message_delta') {
      if (event.usage) usage = { ...(usage || {}), ...event.usage };
      if (event.delta?.stop_reason === 'max_tokens') throw new Error('The model reached its token limit before completing the response.');
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') { fullText += event.delta.text; onToken?.(event.delta.text, fullText); }
    if (event.type === 'message_stop') complete = true;
  }
  try {
    while (!complete) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) { processLine(line); if (complete) break; }
      if (done) { if (!complete && buffer) processLine(buffer); break; }
    }
    if (!complete) throw new Error('Model stream ended before the assessment was complete. Please retry.');
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await reader.cancel(); } catch { /* preserve original result/error */ }
    reader.releaseLock();
  }
  if (usage) onUsage?.(usage);
  await onDone?.(fullText);
  return fullText;
}
