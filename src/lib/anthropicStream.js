// Require the provider's terminal event before callers persist a result.
export async function readAnthropicStream(body, { onToken, onDone } = {}) {
  if (!body) throw new Error('Anthropic returned an empty response stream.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let complete = false;

  function processLine(line) {
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    const event = JSON.parse(raw);
    if (event.type === 'error') {
      throw new Error(event.error?.message || 'Stream error from Anthropic API');
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      fullText += event.delta.text;
      onToken?.(event.delta.text, fullText);
    }
    if (event.type === 'message_stop') complete = true;
  }

  try {
    while (!complete) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        processLine(line);
        if (complete) break;
      }
      if (done) {
        if (!complete && buffer) processLine(buffer);
        break;
      }
    }
    if (!complete) throw new Error('Anthropic stream ended before the assessment was complete. Please retry.');
  } finally {
    // Stop reading on completion/error and always release the stream lock.
    try { await reader.cancel(); } catch { /* preserve the original result/error */ }
    reader.releaseLock();
  }
  await onDone?.(fullText);
  return fullText;
}
