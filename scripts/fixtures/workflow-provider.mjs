// Loaded only by the native smoke test's worker. Never used by application startup.
globalThis.fetch = async () => {
  throw new Error('Unexpected unmocked request');
};
globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  const prompt = request.messages.map(m => m.content).join('\n');
  const brief = { headline: 'Test recovery capability', findings: [{ title: 'Recovery requires evidence', impact: 'Test before rollout', basis: 'MODEL_INFERENCE', references: [] }], disagreements: [], revisit: ['Measure recovery'], actions: [{ title: 'Run an exercise', completion_criteria: 'Record recovery time', evidence_ids: ['scenario'] }] };
  const text = prompt.includes('Produce a concise decision brief') ? JSON.stringify(brief) : 'Recovery requires an exercise.\nSEVERITY: MEDIUM\nCONFIDENCE: 60\nLIKELIHOOD: 3\nIMPACT: 3';
  await new Promise(resolve => setTimeout(resolve, 150));
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { headers: { 'Content-Type': 'application/json' } });
};
