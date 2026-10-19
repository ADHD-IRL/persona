import { useState, useEffect } from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { Settings2, Key, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import WrButton from '@/components/ui/WrButton';
import { getModelId, setModelPref } from '@/lib/llm';
import { apiRequest } from '@/lib/apiClient';
import DangerZone from '@/components/settings/DangerZone';

const ANTHROPIC_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet' },
  { value: 'claude-opus-4-7', label: 'Claude Opus' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku' },
];

export default function Settings() {
  const { workspace, llmConfig, refreshWorkspace } = useWorkspace();
  const isAIP = llmConfig?.provider === 'mitre_aip';
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const fieldStyle = { backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' };
  useEffect(() => {
    setModel(getModelId()); setApiKey(workspace?.anthropic_api_key || ''); setShowKey(false);
    setModels([]); setSaved(false); setTestResult(null); setError('');
  }, [workspace?.id, llmConfig?.provider]);
  const loadModels = async () => {
    setLoadingModels(true); setError('');
    try {
      const data = await apiRequest(`/api/llm/models?${new URLSearchParams({ workspace_id: workspace.id })}`);
      setModels(data.models);
    } catch (err) { setError(err.message); }
    finally { setLoadingModels(false); }
  };
  const save = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      if (!model) throw new Error('Select a model first.');
      if (isAIP && model !== llmConfig.defaultModel && !models.includes(model)) throw new Error('Refresh the model list and select an accessible model.');
      if (!isAIP) await apiRequest(`/api/workspaces/${workspace.id}`, { method: 'PATCH', body: { anthropic_api_key: apiKey.trim() } });
      setModelPref(model);
      if (!isAIP) await refreshWorkspace();
      setSaved(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const testConnection = async () => {
    setTesting(true); setTestResult(null); setError('');
    try {
      if (!model) throw new Error('Select a model first.');
      const response = await fetch('/api/llm/messages', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspace.id, ...(!isAIP ? { 'x-api-key': apiKey.trim() } : {}) },
        body: JSON.stringify({ model, max_tokens: 128, messages: [{ role: 'user', content: 'Reply with just: OK' }] }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error?.message || data.error || `Provider returned HTTP ${response.status}.`);
      if (!data.content?.some(block => block.type === 'text' && block.text?.trim())) throw new Error('The provider returned an empty response.');
      if (data.stop_reason === 'max_tokens') throw new Error('The test response reached its token limit.');
      setTestResult({ usage: data.usage || null });
    } catch (err) { setError(err.message); }
    finally { setTesting(false); }
  };
  const available = isAIP ? [...new Set([llmConfig?.defaultModel, ...models].filter(Boolean))].map(value => ({ value, label: value })) : ANTHROPIC_MODELS;
  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      <PageHeader icon={Settings2} title="SETTINGS" subtitle="AI connection and local application settings" />
      <div className="p-6 max-w-2xl space-y-6">
        <section data-ui="surface" className="rounded p-5 space-y-4" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <h2 className="font-bold text-sm" style={{ color: 'var(--wr-text-primary)' }}>{isAIP ? 'MITRE AI Platform' : 'Anthropic'}</h2>
          <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{isAIP ? 'The local server manages the AIP connection and credentials. Choose an accessible model and test the connection.' : 'Your API key is saved for this local application. Requests pass through the local server.'}</p>
          {isAIP && !llmConfig?.configured && <p className="text-xs" role="alert" style={{ color: '#C0392B' }}>The server needs an AIP API key before models can be listed or used.</p>}
          {isAIP && !llmConfig?.supportsTools && <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Text analysis is available. Tool-enabled replies require a model with confirmed tool support and server configuration.</p>}
          {!isAIP && <div>
            <label htmlFor="anthropic-key" className="flex gap-2 text-xs mb-2" style={{ color: 'var(--wr-text-muted)' }}><Key className="w-4 h-4" />Anthropic API key</label>
            <div className="flex gap-2">
              <input id="anthropic-key" type={showKey ? 'text' : 'password'} value={apiKey} onChange={event => { setApiKey(event.target.value); setSaved(false); setTestResult(null); }} placeholder="sk-ant-…" className="flex-1 px-3 py-2 rounded text-sm font-mono" style={fieldStyle} />
              <button data-ui="action" aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey(value => !value)} style={{ color: 'var(--wr-text-muted)' }}>{showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
          </div>}
          <div>
            <label htmlFor="ai-model" className="block text-xs mb-2" style={{ color: 'var(--wr-text-muted)' }}>Model</label>
            <select id="ai-model" value={model} onChange={event => { setModel(event.target.value); setSaved(false); setTestResult(null); }} className="w-full px-3 py-2 rounded text-sm" style={fieldStyle}>
              <option value="">Select a model</option>
              {model && !available.some(item => item.value === model) && <option value={model}>{model} (refresh to confirm)</option>}
              {available.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            {isAIP && <WrButton variant="secondary" onClick={loadModels} disabled={loadingModels || !llmConfig?.configured}>{loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh models'}</WrButton>}
            <WrButton variant="secondary" onClick={testConnection} disabled={testing || saving || !model || (isAIP && !llmConfig?.configured)}>{testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test connection'}</WrButton>
            <WrButton onClick={save} disabled={saving || testing || !model}>{saving ? 'Saving…' : isAIP ? 'Save model' : 'Save settings'}</WrButton>
          </div>
          {saved && <p className="text-xs" style={{ color: '#27AE60' }}>Saved.</p>}
          {testResult && <div className="text-xs space-y-1" style={{ color: '#27AE60' }}><p className="flex gap-1"><CheckCircle2 className="w-4 h-4" />Connection verified. Use Save to apply these settings.</p><p>{testResult.usage ? `Test usage: ${testResult.usage.input_tokens} input, ${testResult.usage.output_tokens} output tokens.` : 'Token usage was not supplied by this provider.'}</p></div>}
          {error && <p role="alert" className="text-xs" style={{ color: '#C0392B' }}>{error}</p>}
        </section>
        <DangerZone />
      </div>
    </div>
  );
}
