import { useState, useEffect } from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { Settings2, Brain, Key, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import WrButton from '@/components/ui/WrButton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { setModelPref } from '@/lib/llm';
import { saveWorkspaceKey } from '@/lib/workspaceLifecycle';
import { supabase } from '@/lib/supabase';
import DangerZone from '@/components/settings/DangerZone';

const MODELS = [
  {
    value: 'claude_sonnet_4_6',
    label: 'Claude Sonnet',
    provider: 'Anthropic',
    description: 'Balanced performance and speed. Recommended for most use cases.',
    badge: 'DEFAULT',
    badgeColor: '#27AE60',
  },
  {
    value: 'claude_opus_4_6',
    label: 'Claude Opus',
    provider: 'Anthropic',
    description: 'Most powerful Anthropic model. Best for deep, complex analysis.',
    badge: 'PREMIUM',
    badgeColor: '#D68910',
  },
  {
    value: 'claude_haiku',
    label: 'Claude Haiku',
    provider: 'Anthropic',
    description: 'Fastest and most economical. Good for quick iterations.',
    badge: 'FAST',
    badgeColor: '#2E86AB',
  },
];

const MODEL_MAP = { claude_sonnet_4_6: 'claude-sonnet-4-6', claude_opus_4_6: 'claude-opus-4-7', claude_haiku: 'claude-haiku-4-5-20251001' };

export default function Settings() {
  const { workspace, refreshWorkspace } = useWorkspace();
  const [currentModel, setCurrentModel] = useState('claude_sonnet_4_6');
  const [apiKey, setApiKeyState] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [testError, setTestError] = useState('');
  const [testing, setTesting] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setApiKeyState(workspace?.anthropic_api_key || '');
    setShowKey(false);
    const stored = localStorage.getItem('agd_llm_model') || 'claude_sonnet_4_6';
    setCurrentModel(stored);
  }, [workspace]);

  useEffect(() => {
    setTestStatus(null);
    setSaved(false);
    setSaveError('');
  }, [workspace?.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    const trimmed = apiKey.trim();
    try {
      setSaved(false);
      await saveWorkspaceKey(supabase, workspace.id, trimmed);
      setModelPref(currentModel);
      await refreshWorkspace();

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Save failed:', e);
      setSaveError(e?.message || 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) { setTestStatus('error'); setTestError('No key entered.'); return; }
    setTesting(true);
    setTestStatus(null);
    setTestError('');
    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL_MAP[currentModel] || 'claude-haiku-4-5-20251001',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      if (res.ok) {
        await saveWorkspaceKey(supabase, workspace.id, apiKey.trim());
        await refreshWorkspace();
        setTestStatus('ok');
      } else {
        const data = await res.json().catch(() => ({}));
        setTestStatus('error');
        setTestError(`HTTP ${res.status}${data?.error?.message ? ': ' + data.error.message : ''}`);
      }
    } catch (e) {
      console.error('API key test failed:', e);
      setTestStatus('error');
      setTestError(e?.message || 'Network error — check browser console for details');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      <PageHeader icon={Settings2} title="SETTINGS" subtitle="Platform configuration and preferences" />

      <div className="p-6 max-w-2xl space-y-6">

        {/* API Key */}
        <div className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              ANTHROPIC API KEY
            </h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
            Required for all AI features. Saved in your Supabase workspace and shared with its members. Requests pass through the application proxy to Anthropic.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKeyState(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 rounded text-sm font-mono pr-10"
                style={{
                  backgroundColor: 'var(--wr-bg-secondary)',
                  border: '1px solid var(--wr-border)',
                  color: 'var(--wr-text-primary)',
                  outline: 'none',
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowKey(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                    style={{ color: 'var(--wr-text-muted)' }}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">{showKey ? 'Hide API key' : 'Show API key'}</TooltipContent>
              </Tooltip>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <WrButton onClick={handleTestKey} disabled={testing || saving || !apiKey.trim()} variant="secondary">
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                </WrButton>
              </TooltipTrigger>
              <TooltipContent side="right">Send a test request to verify this key has Messages API access</TooltipContent>
            </Tooltip>
          </div>
          {testStatus === 'ok' && (
            <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#27AE60' }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Key verified and saved — sessions will use this key.
            </p>
          )}
          {testStatus === 'error' && (
            <p className="text-xs mt-2" style={{ color: '#C0392B' }}>
              Key test failed.{testError ? ` ${testError}` : ' Check it is correct and has Messages API access.'}
            </p>
          )}
        </div>

        {/* LLM Model */}
        <div className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
              AI MODEL SELECTION
            </h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
            Choose the model used for all AI features: agent generation, assessments, synthesis, chain building, scenario enhancement.
          </p>
          <div className="space-y-3">
            {MODELS.map((model) => {
              const isSelected = currentModel === model.value;
              return (
                <button key={model.value} onClick={() => setCurrentModel(model.value)}
                  className="w-full text-left rounded p-4 transition-all"
                  style={{
                    backgroundColor: isSelected ? 'rgba(240,165,0,0.06)' : 'var(--wr-bg-secondary)',
                    border: isSelected ? '1px solid rgba(240,165,0,0.4)' : '1px solid var(--wr-border)',
                  }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: isSelected ? 'var(--wr-amber)' : 'var(--wr-border)' }}>
                        {isSelected && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--wr-amber)' }} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold" style={{ color: 'var(--wr-text-primary)' }}>{model.label}</span>
                          <span className="text-xs font-mono" style={{ color: 'var(--wr-text-muted)' }}>by {model.provider}</span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--wr-text-secondary)' }}>{model.description}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono px-2 py-0.5 rounded flex-shrink-0"
                      style={{ backgroundColor: `${model.badgeColor}22`, color: model.badgeColor }}>
                      {model.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <WrButton onClick={handleSave} disabled={saving || testing}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Settings'}
          </WrButton>
          {saved && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#27AE60' }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Settings saved.
            </div>
          )}
          {saveError && (
            <p className="text-xs" style={{ color: '#C0392B' }}>Save error: {saveError}</p>
          )}
        </div>

        {/* Danger Zone — archive + reset */}
        <DangerZone />

      </div>
    </div>
  );
}
