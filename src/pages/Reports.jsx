import MarkdownContent from '@/components/ui/MarkdownContent';
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { BarChart3, Download, FileText, Target, Link2, Bot } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import WrButton from '@/components/ui/WrButton';
import { WrSelect } from '@/components/ui/WrInput';

// Convert markdown text to HTML for PDF rendering
function markdownToHtml(text) {
  if (!text) return '';
  return text
    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    // Horizontal rules
    .replace(/^---+$/gm, '<hr>')
    // Paragraphs: double newlines become paragraph breaks
    .replace(/\n\n/g, '</p><p>')
    // Wrap in paragraph if not already a block element
    .replace(/^(?!<[hul]|<hr)(.+)$/gm, (line) => line.startsWith('<') ? line : line)
    // Line breaks within paragraphs
    .replace(/\n(?!<)/g, '<br>');
}

const SECTIONS = [
  { key: 'cover', label: 'Cover Page' },
  { key: 'brief', label: 'Situation Brief' },
  { key: 'roster', label: 'Agent Roster' },
  { key: 'consensus', label: 'Consensus Findings' },
  { key: 'chains', label: 'Compound Chains' },
  { key: 'contested', label: 'Contested Findings' },
  { key: 'actions', label: 'Priority Actions' },
  { key: 'round1', label: 'Round 1 Assessments' },
  { key: 'round2', label: 'Round 2 Rebuttals' },
  { key: 'synthesis', label: 'Synthesis' },
  { key: 'transcript', label: 'Full Transcript' },
];

export default function Reports() {
  const { db } = useWorkspace();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session') || '';
  const [sessions, setSessions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [domains, setDomains] = useState([]);
  const [chains, setChains] = useState([]);
  const [selectedSession, setSelectedSession] = useState(sessionParam);
  const [selectedSections, setSelectedSections] = useState(new Set(SECTIONS.map(s => s.key)));
  const [sessionAgents, setSessionAgents] = useState([]);
  const [synthesis, setSynthesis] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [selectedChain, setSelectedChain] = useState('');
  const [selectedExecSession, setSelectedExecSession] = useState(sessionParam);
  const [execSessionAgents, setExecSessionAgents] = useState([]);
  const [execSynthesis, setExecSynthesis] = useState(null);

  // Agent Report state
  const [agentFilterDomain, setAgentFilterDomain] = useState('');
  const [agentFilterExpertise, setAgentFilterExpertise] = useState('');
  const [agentFilterReasoning, setAgentFilterReasoning] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState(new Set());

  useEffect(() => {
    if (!db) return;
    Promise.all([
      db.Session.list(),
      db.Agent.list(),
      db.Scenario.list(),
      db.Domain.list(),
      db.Chain.list(),
    ]).then(([s,a,sc,d,ch]) => { setSessions(s); setAgents(a); setScenarios(sc); setDomains(d); setChains(ch); });
  }, [db]);

  useEffect(() => {
    if (!selectedSession || !db) return;
    Promise.all([
      db.SessionAgent.filter({ session_id: selectedSession }),
      db.SessionSynthesis.filter({ session_id: selectedSession }),
    ]).then(async ([sa, synth]) => {
      setSessionAgents(sa);
      const s = synth[0] || null;
      if (s?.raw_text?.startsWith('http')) {
        const text = await fetch(s.raw_text).then(r => r.text());
        setSynthesis({ ...s, raw_text: text });
      } else {
        setSynthesis(s);
      }
    });
  }, [selectedSession]);

  useEffect(() => {
    if (!selectedExecSession || !db) return;
    Promise.all([
      db.SessionAgent.filter({ session_id: selectedExecSession }),
      db.SessionSynthesis.filter({ session_id: selectedExecSession }),
    ]).then(async ([sa, synth]) => {
      setExecSessionAgents(sa);
      const s = synth[0] || null;
      if (s?.raw_text?.startsWith('http')) {
        const text = await fetch(s.raw_text).then(r => r.text());
        setExecSynthesis({ ...s, raw_text: text });
      } else {
        setExecSynthesis(s);
      }
    });
  }, [selectedExecSession]);

  const session = sessions.find(s => s.id === selectedSession);
  const scenario = scenarios.find(s => s.id === session?.scenario_id);
  const chainForExport = chains.find(c => c.id === selectedChain);

  const execSession = sessions.find(s => s.id === selectedExecSession);
  const execScenario = scenarios.find(s => s.id === execSession?.scenario_id);
  const execDomain = domains.find(d => d.id === execSession?.domain_id || d.id === execScenario?.domain_id);
  // Chains linked to this session's scenario
  const execChains = chains.filter(c => c.scenario_id === execSession?.scenario_id);

  const SEV_COLOR = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };

  const printExecutiveReport = () => {
    if (!execSession) return;
    const agentById = (id) => agents.find(a => a.id === id);

    // Severity summary
    const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    execSessionAgents.forEach(sa => {
      const sev = sa.round2_revised_severity || sa.round1_severity;
      if (sev && sevCounts[sev] !== undefined) sevCounts[sev]++;
    });
    const totalAssessments = Object.values(sevCounts).reduce((a, b) => a + b, 0);

    const sevBadge = (sev) => {
      const colors = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };
      const c = colors[sev] || '#999';
      return `<span style="display:inline-block;background:${c};color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;padding:2px 8px;border-radius:3px;font-family:monospace;">${sev}</span>`;
    };

    const chainStepsHtml = (chain) => {
      if (!chain.steps?.length) return '<p style="color:#999;font-style:italic;">No steps defined.</p>';
      return chain.steps.map((step, i) => {
        const isLast = i === chain.steps.length - 1;
        return `
          <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:${isLast ? 0 : 8}px;">
            <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#FFF3CD;border:2px solid #F0A500;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:monospace;color:#B7770D;">${step.step_number}</div>
            <div style="flex:1;padding:10px 14px;background:#FAFAFA;border:1px solid #E8E8E8;border-left:3px solid #F0A500;border-radius:0 4px 4px 0;">
              <div style="font-size:11px;font-weight:700;color:#B7770D;margin-bottom:4px;font-family:monospace;letter-spacing:0.5px;">${step.agent_label || agentById(step.agent_id)?.name || '—'}</div>
              <div style="font-size:12px;color:#333;line-height:1.6;">${step.step_text || ''}</div>
            </div>
          </div>
          ${!isLast ? `<div style="display:flex;gap:16px;align-items:center;margin-bottom:8px;"><div style="width:28px;flex-shrink:0;display:flex;justify-content:center;"><div style="width:2px;height:16px;background:#F0A500;opacity:0.4;"></div></div><div style="flex:1;"></div></div>` : ''}
        `;
      }).join('');
    };

    const breakChainHtml = (chain) => {
      if (!chain.steps?.length) return '';
      return `
        <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11px;">
          <thead>
            <tr style="background:#F9F3E3;border-bottom:2px solid #F0A500;">
              <th style="padding:8px 10px;text-align:left;color:#8B6914;font-family:monospace;letter-spacing:0.5px;width:60px;">STEP</th>
              <th style="padding:8px 10px;text-align:left;color:#8B6914;font-family:monospace;letter-spacing:0.5px;width:180px;">ACTOR</th>
              <th style="padding:8px 10px;text-align:left;color:#8B6914;font-family:monospace;letter-spacing:0.5px;">BREAK POINT OPPORTUNITY</th>
            </tr>
          </thead>
          <tbody>
            ${chain.steps.map((step, i) => `
              <tr style="border-bottom:1px solid #F0EAD6;background:${i % 2 === 0 ? '#fff' : '#FFFDF7'};">
                <td style="padding:8px 10px;font-weight:700;color:#F0A500;font-family:monospace;">${step.step_number}</td>
                <td style="padding:8px 10px;color:#555;font-style:italic;">${step.agent_label || agentById(step.agent_id)?.name || '—'}</td>
                <td style="padding:8px 10px;color:#777;">[ Assess controls, detection points, or mitigations that could disrupt this step ]</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };

    let html = `<!DOCTYPE html><html><head><title>${execSession.name} — Executive Report</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Georgia', serif; color: #1a1a1a; background: #fff; font-size: 13px; line-height: 1.7; }
      .page { max-width: 900px; margin: 0 auto; padding: 60px 70px; }
      /* Cover */
      .cover { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; border-bottom: 4px solid #F0A500; padding-bottom: 60px; }
      .cover-label { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #B7770D; text-transform: uppercase; margin-bottom: 12px; }
      .cover-title { font-size: 38px; font-weight: 700; color: #0D1B2A; line-height: 1.2; margin-bottom: 8px; }
      .cover-subtitle { font-size: 18px; color: #555; margin-bottom: 32px; }
      .cover-meta { display: flex; gap: 32px; flex-wrap: wrap; border-top: 1px solid #E0E0E0; padding-top: 20px; }
      .cover-meta-item { }
      .cover-meta-label { font-size: 10px; font-family: monospace; letter-spacing: 1px; color: #999; text-transform: uppercase; margin-bottom: 2px; }
      .cover-meta-value { font-size: 13px; font-weight: 600; color: #333; }
      .sev-bar { display: flex; gap: 16px; margin-top: 32px; flex-wrap: wrap; }
      .sev-pill { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 4px; }
      /* Sections */
      .section { margin-top: 56px; }
      .section-label { font-family: monospace; font-size: 9px; letter-spacing: 3px; color: #B7770D; text-transform: uppercase; margin-bottom: 4px; }
      .section-title { font-size: 22px; font-weight: 700; color: #0D1B2A; border-bottom: 2px solid #F0A500; padding-bottom: 8px; margin-bottom: 20px; }
      h3 { font-size: 15px; color: #222; margin: 24px 0 6px; }
      h4 { font-size: 13px; color: #444; margin: 16px 0 4px; }
      p { margin: 6px 0; }
      ul { padding-left: 20px; margin: 8px 0; } li { margin-bottom: 5px; }
      .finding-card { background: #FAFAFA; border-left: 4px solid #2E86AB; padding: 12px 16px; margin: 10px 0; border-radius: 0 4px 4px 0; }
      .finding-card.critical { border-left-color: #C0392B; }
      .finding-card.high { border-left-color: #D68910; }
      .agent-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid #F0EAD6; }
      .agent-avatar { width: 36px; height: 36px; border-radius: 50%; background: #F9F3E3; border: 2px solid #F0A500; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #B7770D; flex-shrink: 0; font-family: monospace; }
      .chain-box { background: #FAFAFA; border: 1px solid #E8E8E8; border-radius: 6px; padding: 16px; margin: 16px 0; }
      .chain-title { font-size: 14px; font-weight: 700; color: #0D1B2A; margin-bottom: 6px; }
      .chain-desc { font-size: 12px; color: #666; margin-bottom: 14px; font-style: italic; }
      .footer { margin-top: 72px; padding-top: 16px; border-top: 1px solid #E0E0E0; font-size: 10px; color: #aaa; font-family: monospace; display: flex; justify-content: space-between; }
      .page-break { page-break-before: always; margin-top: 0; padding-top: 60px; }
      strong { font-weight: 700; } em { font-style: italic; }
      @media print { .page { padding: 40px 50px; } }
    </style></head><body><div class="page">`;

    // ── COVER ──────────────────────────────────────────────────────────
    html += `<div class="cover">
      <div class="cover-label">AgentDebate — Red Team Intelligence Platform</div>
      <div class="cover-title">${execSession.name}</div>
      <div class="cover-subtitle">Executive Threat Assessment Report</div>
      <div class="cover-meta">
        <div class="cover-meta-item"><div class="cover-meta-label">Date</div><div class="cover-meta-value">${new Date(execSession.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
        ${execSession.phase_focus ? `<div class="cover-meta-item"><div class="cover-meta-label">Phase</div><div class="cover-meta-value">${execSession.phase_focus}</div></div>` : ''}
        ${execScenario ? `<div class="cover-meta-item"><div class="cover-meta-label">Scenario</div><div class="cover-meta-value">${execScenario.name}</div></div>` : ''}
        ${execDomain ? `<div class="cover-meta-item"><div class="cover-meta-label">Domain</div><div class="cover-meta-value">${execDomain.name}</div></div>` : ''}
        <div class="cover-meta-item"><div class="cover-meta-label">Analysts</div><div class="cover-meta-value">${execSessionAgents.length} agents</div></div>
        <div class="cover-meta-item"><div class="cover-meta-label">Chains Analyzed</div><div class="cover-meta-value">${execChains.length}</div></div>
      </div>
      <div class="sev-bar">
        ${Object.entries(sevCounts).filter(([,v]) => v > 0).map(([key, val]) => `
          <div class="sev-pill" style="background:${SEV_COLOR[key]}18;border:1px solid ${SEV_COLOR[key]}44;">
            <span style="font-size:10px;font-weight:700;font-family:monospace;color:${SEV_COLOR[key]};">${key}</span>
            <span style="font-size:20px;font-weight:700;color:${SEV_COLOR[key]};">${val}</span>
            <span style="font-size:10px;color:#999;">${totalAssessments > 0 ? Math.round(val/totalAssessments*100) : 0}%</span>
          </div>
        `).join('')}
      </div>
    </div>`;

    // ── SECTION 1: SCENARIO OVERVIEW ───────────────────────────────────
    if (execScenario) {
      html += `<div class="section">
        <div class="section-label">Section 01</div>
        <div class="section-title">Scenario Overview</div>
        ${execScenario.description ? `<p style="font-size:14px;color:#444;margin-bottom:16px;">${execScenario.description}</p>` : ''}
        ${execScenario.context_document ? `<div style="background:#F9F9F9;border:1px solid #E8E8E8;border-radius:4px;padding:20px;font-size:12px;color:#444;line-height:1.8;">${markdownToHtml(execScenario.context_document)}</div>` : ''}
      </div>`;
    }

    // ── SECTION 2: KEY FINDINGS ────────────────────────────────────────
    const critHighAgents = execSessionAgents
      .filter(sa => ['CRITICAL', 'HIGH'].includes(sa.round2_revised_severity || sa.round1_severity))
      .sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1 };
        return (order[a.round2_revised_severity || a.round1_severity] ?? 2) - (order[b.round2_revised_severity || b.round1_severity] ?? 2);
      });

    html += `<div class="section page-break">
      <div class="section-label">Section 02</div>
      <div class="section-title">Key Findings & Agent Assessments</div>`;

    if (execSynthesis?.priority_mitigations?.length) {
      html += `<h3 style="color:#C0392B;">⚠ Priority Actions</h3><ul>`;
      execSynthesis.priority_mitigations.forEach(m => { html += `<li>${m}</li>`; });
      html += `</ul>`;
    }

    if (execSynthesis?.consensus_findings?.length) {
      html += `<h3>Consensus Findings</h3>`;
      execSynthesis.consensus_findings.forEach(f => {
        html += `<div class="finding-card">${f.finding || JSON.stringify(f)}</div>`;
      });
    }

    if (execSynthesis?.contested_findings?.length) {
      html += `<h3>Contested Findings</h3>`;
      execSynthesis.contested_findings.forEach(f => {
        html += `<div class="finding-card high">${f.finding || JSON.stringify(f)}</div>`;
      });
    }

    if (critHighAgents.length > 0) {
      html += `<h3>Critical & High Severity Assessments</h3>`;
      critHighAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        const sev = sa.round2_revised_severity || sa.round1_severity;
        const text = sa.round2_rebuttal || sa.round1_assessment || '';
        html += `
          <div class="agent-row">
            <div class="agent-avatar">${(agent?.name || '?').substring(0,2).toUpperCase()}</div>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                <strong>${agent?.name || 'Unknown'}</strong>
                <span style="font-size:11px;color:#888;">${agent?.discipline || ''}</span>
                ${sevBadge(sev)}
              </div>
              <div class="finding-card ${sev?.toLowerCase()}" style="margin-top:4px;font-size:12px;">${markdownToHtml(text)}</div>
            </div>
          </div>`;
      });
    }

    if (execSynthesis?.raw_text) {
      html += `<h3>Synthesis Summary</h3><div style="background:#F9F9F9;border:1px solid #E8E8E8;border-radius:4px;padding:16px;font-size:12px;color:#444;line-height:1.8;">${markdownToHtml(execSynthesis.raw_text)}</div>`;
    }

    html += `</div>`;

    // ── SECTION 3: THREAT CHAINS & BREAK-THE-CHAIN ANALYSIS ──────────
    html += `<div class="section page-break">
      <div class="section-label">Section 03</div>
      <div class="section-title">Threat Chains — Break-the-Chain Analysis</div>
      <p style="color:#555;margin-bottom:24px;font-size:13px;">
        Each chain below represents a multi-step threat progression linked to the scenario under analysis. 
        The <strong>Break Point Opportunity</strong> table identifies where controls, detection, or countermeasures 
        can sever the chain before it reaches its terminal impact.
      </p>`;

    if (execChains.length === 0) {
      html += `<p style="color:#999;font-style:italic;">No chains are linked to this session's scenario.</p>`;
    } else {
      execChains.forEach((chain, idx) => {
        html += `
          <div class="chain-box" ${idx > 0 ? 'style="margin-top:32px;"' : ''}>
            <div class="chain-title">${chain.name}</div>
            ${chain.description ? `<div class="chain-desc">${chain.description}</div>` : ''}
            <div style="margin-bottom:20px;">
              <div style="font-size:10px;font-family:monospace;letter-spacing:1px;color:#B7770D;margin-bottom:10px;">ATTACK PROGRESSION</div>
              ${chainStepsHtml(chain)}
            </div>
            <div>
              <div style="font-size:10px;font-family:monospace;letter-spacing:1px;color:#2E86AB;margin-bottom:6px;">BREAK-THE-CHAIN WORKSHEET</div>
              ${breakChainHtml(chain)}
            </div>
          </div>`;
      });
    }

    html += `</div>`;

    // ── FOOTER ─────────────────────────────────────────────────────────
    html += `<div class="footer">
      <span>AgentDebate — Structured Red Team Intelligence Platform</span>
      <span>CONFIDENTIAL — ${new Date().toLocaleDateString()}</span>
    </div>`;

    html += `</div><script>window.onload = function() { window.focus(); window.print(); };<\/script></body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  const exportChainMarkdown = () => {
    if (!chainForExport) return;
    const dom = domains.find(d => d.id === chainForExport.domain_id);
    const sc = scenarios.find(s => s.id === chainForExport.scenario_id);
    const lines = [];

    lines.push(`# CHAIN REPORT`);
    lines.push(`## ${chainForExport.name}`);
    lines.push('');
    if (dom) lines.push(`**Domain:** ${dom.name}`);
    if (sc) lines.push(`**Scenario:** ${sc.name}`);
    if (chainForExport.is_ai_generated) lines.push(`**Source:** AI Generated`);
    lines.push(`**Steps:** ${chainForExport.steps?.length || 0}`);
    lines.push(`**Exported:** ${new Date().toLocaleDateString()}`);
    lines.push('');

    if (chainForExport.description) {
      lines.push(`## Overview`);
      lines.push(chainForExport.description);
      lines.push('');
    }

    if (chainForExport.steps?.length > 0) {
      lines.push(`## Step-by-Step Progression`);
      lines.push('');
      chainForExport.steps.forEach(step => {
        const agent = agents.find(a => a.id === step.agent_id);
        const agentLabel = agent ? `${agent.name}${agent.discipline ? ` (${agent.discipline})` : ''}` : (step.agent_label || '—');
        lines.push(`### Step ${step.step_number}: ${agentLabel}`);
        lines.push('');
        lines.push(step.step_text || '');
        lines.push('');
        lines.push('---');
        lines.push('');
      });
    }

    lines.push(`*Generated by AgentDebate — Structured Red Team Intelligence Platform*`);

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chain-${chainForExport.name.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Scenario brief export
  const scenarioForExport = scenarios.find(s => s.id === selectedScenario);
  const domainForScenario = domains.find(d => d.id === scenarioForExport?.domain_id);

  const exportScenarioMarkdown = () => {
    if (!scenarioForExport) return;
    const lines = [];
    lines.push(`# OPERATIONAL BRIEF`);
    lines.push(`## ${scenarioForExport.name}`);
    lines.push('');
    if (domainForScenario) lines.push(`**Domain:** ${domainForScenario.name}`);
    lines.push(`**Status:** ${scenarioForExport.status?.toUpperCase()}`);
    lines.push(`**Exported:** ${new Date().toLocaleDateString()}`);
    lines.push('');
    if (scenarioForExport.description) {
      lines.push(`### Overview`);
      lines.push(scenarioForExport.description);
      lines.push('');
    }
    if (scenarioForExport.context_document) {
      lines.push(`### Context Document`);
      lines.push(scenarioForExport.context_document);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brief-${scenarioForExport.name.replace(/\s+/g,'-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportScenarioPdf = () => {
    if (!scenarioForExport) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${scenarioForExport.name} — Operational Brief</title>
      <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 60px auto; color: #1a1a1a; line-height: 1.7; }
        h1 { font-size: 28px; border-bottom: 3px solid #F0A500; padding-bottom: 10px; margin-bottom: 4px; }
        h2 { font-size: 20px; color: #333; margin-top: 36px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
        h3 { font-size: 16px; color: #444; margin-top: 24px; margin-bottom: 4px; }
        h4 { font-size: 14px; color: #555; margin-top: 16px; margin-bottom: 2px; }
        p { margin: 8px 0; }
        .meta { font-size: 13px; color: #666; margin-bottom: 32px; display: flex; gap: 24px; flex-wrap: wrap; }
        .badge { background: #f5f5f5; border: 1px solid #ddd; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; }
        ul { padding-left: 20px; margin: 8px 0; } li { margin-bottom: 5px; }
        strong { font-weight: 700; } em { font-style: italic; }
        hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
        .footer { margin-top: 60px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
        @media print { body { margin: 30px; } }
      </style></head><body>
      <h1>${scenarioForExport.name}</h1>
      <p style="font-size:18px;color:#444;margin-top:0;">Operational Brief</p>
      <div class="meta">
        ${domainForScenario ? `<span>Domain: <span class="badge">${domainForScenario.name}</span></span>` : ''}
        <span>Status: <span class="badge">${scenarioForExport.status?.toUpperCase()}</span></span>
        <span>Exported: ${new Date().toLocaleDateString()}</span>
      </div>
      ${scenarioForExport.description ? `<h2>Overview</h2><p>${markdownToHtml(scenarioForExport.description)}</p>` : ''}
      ${scenarioForExport.context_document ? `<h2>Context Document</h2><div>${markdownToHtml(scenarioForExport.context_document)}</div>` : ''}
      <div class="footer">Generated by AgentDebate — Structured Red Team Intelligence Platform</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const toggleSection = (key) => {
    const s = new Set(selectedSections);
    s.has(key) ? s.delete(key) : s.add(key);
    setSelectedSections(s);
  };

  const printReport = () => {
    if (!session) return;
    const agentById = (id) => agents.find(a => a.id === id);

    let html = `<html><head><title>${session.name} — AgentDebate Report</title><style>
      body { font-family: Georgia, serif; max-width: 860px; margin: 60px auto; color: #1a1a1a; line-height: 1.8; font-size: 14px; }
      h1 { font-size: 28px; border-bottom: 3px solid #F0A500; padding-bottom: 10px; margin-bottom: 6px; }
      h2 { font-size: 20px; color: #111; margin-top: 40px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
      h3 { font-size: 16px; margin-top: 28px; margin-bottom: 4px; color: #222; }
      h4 { font-size: 14px; margin-top: 16px; margin-bottom: 2px; color: #333; }
      p { margin: 8px 0; }
      .meta { font-size: 13px; color: #666; margin-bottom: 32px; display: flex; gap: 24px; flex-wrap: wrap; }
      .badge { background: #f5f5f5; border: 1px solid #ddd; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; }
      .sev-CRITICAL { color: #C0392B; font-weight: bold; }
      .sev-HIGH { color: #D68910; font-weight: bold; }
      .sev-MEDIUM { color: #2E86AB; font-weight: bold; }
      .sev-LOW { color: #27AE60; font-weight: bold; }
      .assessment { background: #fafafa; border-left: 3px solid #ddd; padding: 12px 16px; margin: 8px 0; border-radius: 0 4px 4px 0; }
      .assessment h2 { font-size: 15px; margin-top: 16px; border-bottom: none; color: #333; }
      .assessment h3 { font-size: 14px; margin-top: 12px; color: #444; }
      ul { padding-left: 20px; margin: 8px 0; }
      li { margin-bottom: 6px; }
      strong { font-weight: 700; } em { font-style: italic; }
      hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
      .footer { margin-top: 60px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
      @media print { body { margin: 30px; } }
    </style></head><body>`;

    if (selectedSections.has('cover')) {
      html += `<h1>AgentDebate SESSION REPORT</h1>
      <h2 style="border:none;margin-top:4px;font-size:22px;">${session.name}</h2>
      <div class="meta">
        <span>Date: <span class="badge">${new Date(session.created_at).toLocaleDateString()}</span></span>
        <span>Phase: <span class="badge">${session.phase_focus || '—'}</span></span>
        <span>Status: <span class="badge">${session.status?.toUpperCase()}</span></span>
      </div>`;
    }

    if (selectedSections.has('brief') && scenario) {
      html += `<h2>SITUATION BRIEF</h2><p><strong>${scenario.name}</strong></p>`;
      if (scenario.context_document) html += `<div class="assessment">${markdownToHtml(scenario.context_document)}</div>`;
    }

    if (selectedSections.has('roster')) {
      html += `<h2>AGENT ROSTER</h2><ul>`;
      sessionAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        if (agent) html += `<li><strong>${agent.name}</strong> — ${agent.discipline} <span class="sev-${agent.severity_default}">(${agent.severity_default})</span></li>`;
      });
      html += `</ul>`;
    }

    if (selectedSections.has('consensus') && synthesis?.consensus_findings?.length) {
      html += `<h2>CONSENSUS FINDINGS</h2><ul>`;
      synthesis.consensus_findings.forEach(f => { html += `<li>${f.finding || JSON.stringify(f)}</li>`; });
      html += `</ul>`;
    }

    if (selectedSections.has('contested') && synthesis?.contested_findings?.length) {
      html += `<h2>CONTESTED FINDINGS</h2><ul>`;
      synthesis.contested_findings.forEach(f => { html += `<li>${f.finding || JSON.stringify(f)}</li>`; });
      html += `</ul>`;
    }

    if (selectedSections.has('chains') && synthesis?.compound_chains?.length) {
      html += `<h2>COMPOUND CHAINS</h2><ul>`;
      synthesis.compound_chains.forEach(c => { html += `<li>${c.chain || JSON.stringify(c)}</li>`; });
      html += `</ul>`;
    }

    if (selectedSections.has('actions') && synthesis?.priority_mitigations?.length) {
      html += `<h2>PRIORITY ACTIONS</h2><ul>`;
      synthesis.priority_mitigations.forEach(m => { html += `<li>${m}</li>`; });
      html += `</ul>`;
    }

    if (selectedSections.has('round1')) {
      html += `<h2>ROUND 1 — INDEPENDENT ASSESSMENTS</h2>`;
      sessionAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        if (sa.round1_assessment) {
          html += `<h3>${agent?.name} <span style="font-weight:normal;color:#666;">(${agent?.discipline})</span></h3>`;
          html += `<p>Severity: <span class="sev-${sa.round1_severity}">${sa.round1_severity || '—'}</span></p>`;
          html += `<div class="assessment">${markdownToHtml(sa.round1_assessment)}</div>`;
        }
      });
    }

    if (selectedSections.has('round2')) {
      html += `<h2>ROUND 2 — CROSS-DISCIPLINE DEBATE</h2>`;
      sessionAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        if (sa.round2_rebuttal) {
          html += `<h3>${agent?.name} <span style="font-weight:normal;color:#666;">(${agent?.discipline})</span></h3>`;
          html += `<p>Revised Severity: <span class="sev-${sa.round2_revised_severity}">${sa.round2_revised_severity || '—'}</span></p>`;
          html += `<div class="assessment">${markdownToHtml(sa.round2_rebuttal)}</div>`;
        }
      });
    }

    if (selectedSections.has('synthesis') && synthesis?.raw_text) {
      html += `<h2>SYNTHESIS</h2><div class="assessment">${markdownToHtml(synthesis.raw_text)}</div>`;
    }

    if (selectedSections.has('transcript')) {
      html += `<h2>FULL TRANSCRIPT</h2>`;
      sessionAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        const agentLabel = `${agent?.name || 'Unknown'} <span style="font-weight:normal;color:#666;">(${agent?.discipline || ''})</span>`;
        if (sa.round0_briefing) {
          html += `<h3>${agentLabel} — Pre-Session Brief</h3>`;
          html += `<div class="assessment" style="border-left-color:#8A9BB5;">${markdownToHtml(sa.round0_briefing)}</div>`;
        }
        if (sa.round1_assessment) {
          const conf = sa.round1_confidence != null ? ` · <span style="color:#2E86AB;">Confidence: ${sa.round1_confidence}%</span>` : '';
          html += `<h3>${agentLabel} — Round 1</h3>`;
          html += `<p>Severity: <span class="sev-${sa.round1_severity}">${sa.round1_severity || '—'}</span>${conf}</p>`;
          html += `<div class="assessment">${markdownToHtml(sa.round1_assessment)}</div>`;
          if (sa.compound_chain_text) {
            html += `<p style="font-size:12px;color:#888;font-style:italic;margin-top:4px;">Compound chain: ${sa.compound_chain_text}</p>`;
          }
        }
        if (sa.round2_rebuttal) {
          const conf = sa.round2_confidence != null ? ` · <span style="color:#2E86AB;">Confidence: ${sa.round2_confidence}%</span>` : '';
          html += `<h3>${agentLabel} — Round 2</h3>`;
          html += `<p>Revised Severity: <span class="sev-${sa.round2_revised_severity}">${sa.round2_revised_severity || '—'}</span>${conf}</p>`;
          html += `<div class="assessment">${markdownToHtml(sa.round2_rebuttal)}</div>`;
        }
        html += `<hr>`;
      });
    }

    html += `<div class="footer">Generated by AgentDebate — Structured Red Team Intelligence Platform — ${new Date().toLocaleDateString()}</div>`;
    html += `<script>window.onload = function() { window.focus(); window.print(); };<\/script>`;
    html += `</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  const exportMarkdown = () => {
    if (!session) return;
    const agentById = (id) => agents.find(a => a.id === id);
    const lines = [];

    if (selectedSections.has('cover')) {
      lines.push(`# AgentDebate SESSION REPORT`);
      lines.push(`## ${session.name}`);
      lines.push(`**Date:** ${new Date(session.created_at).toLocaleDateString()}`);
      lines.push(`**Phase:** ${session.phase_focus || '—'}`);
      lines.push(`**Status:** ${session.status?.toUpperCase()}`);
      lines.push('');
    }

    if (selectedSections.has('brief') && scenario) {
      lines.push(`## SITUATION BRIEF`);
      lines.push(`**${scenario.name}**`);
      lines.push('');
      if (scenario.context_document) lines.push(scenario.context_document);
      lines.push('');
    }

    if (selectedSections.has('roster')) {
      lines.push(`## AGENT ROSTER`);
      sessionAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        if (agent) lines.push(`- **${agent.name}** — ${agent.discipline} (${agent.severity_default})`);
      });
      lines.push('');
    }

    if (selectedSections.has('consensus') && synthesis?.consensus_findings?.length) {
      lines.push(`## CONSENSUS FINDINGS`);
      synthesis.consensus_findings.forEach(f => { lines.push(`- ${f.finding || JSON.stringify(f)}`); });
      lines.push('');
    }

    if (selectedSections.has('contested') && synthesis?.contested_findings?.length) {
      lines.push(`## CONTESTED FINDINGS`);
      synthesis.contested_findings.forEach(f => { lines.push(`- ${f.finding || JSON.stringify(f)}`); });
      lines.push('');
    }

    if (selectedSections.has('chains') && synthesis?.compound_chains?.length) {
      lines.push(`## COMPOUND CHAINS`);
      synthesis.compound_chains.forEach(c => { lines.push(`- ${c.chain || JSON.stringify(c)}`); });
      lines.push('');
    }

    if (selectedSections.has('actions') && synthesis?.priority_mitigations?.length) {
      lines.push(`## PRIORITY ACTIONS`);
      synthesis.priority_mitigations.forEach(m => { lines.push(`- ${m}`); });
      lines.push('');
    }

    if (selectedSections.has('round1')) {
      lines.push(`## ROUND 1 — INDEPENDENT ASSESSMENTS`);
      sessionAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        if (sa.round1_assessment) {
          lines.push(`\n### ${agent?.name} (${agent?.discipline})`);
          lines.push(`**Severity:** ${sa.round1_severity || '—'}`);
          lines.push(sa.round1_assessment);
        }
      });
      lines.push('');
    }

    if (selectedSections.has('round2')) {
      lines.push(`## ROUND 2 — CROSS-DISCIPLINE DEBATE`);
      sessionAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        if (sa.round2_rebuttal) {
          lines.push(`\n### ${agent?.name} (${agent?.discipline})`);
          lines.push(`**Revised Severity:** ${sa.round2_revised_severity || '—'}`);
          lines.push(sa.round2_rebuttal);
        }
      });
      lines.push('');
    }

    if (selectedSections.has('synthesis') && synthesis?.raw_text) {
      lines.push(`## SYNTHESIS`);
      lines.push(synthesis.raw_text);
      lines.push('');
    }

    if (selectedSections.has('transcript')) {
      lines.push(`## FULL TRANSCRIPT`);
      lines.push('');
      sessionAgents.forEach(sa => {
        const agent = agentById(sa.agent_id);
        const agentLabel = `${agent?.name || 'Unknown'} (${agent?.discipline || ''})`;
        if (sa.round0_briefing) {
          lines.push(`### ${agentLabel} — Pre-Session Brief`);
          lines.push(sa.round0_briefing);
          lines.push('');
        }
        if (sa.round1_assessment) {
          const conf = sa.round1_confidence != null ? ` · Confidence: ${sa.round1_confidence}%` : '';
          lines.push(`### ${agentLabel} — Round 1 [${sa.round1_severity || '—'}${conf}]`);
          lines.push(sa.round1_assessment);
          if (sa.compound_chain_text) lines.push(`\n*Compound chain: ${sa.compound_chain_text}*`);
          lines.push('');
        }
        if (sa.round2_rebuttal) {
          const conf = sa.round2_confidence != null ? ` · Confidence: ${sa.round2_confidence}%` : '';
          lines.push(`### ${agentLabel} — Round 2 [${sa.round2_revised_severity || '—'}${conf}]`);
          lines.push(sa.round2_rebuttal);
          lines.push('');
        }
        lines.push('---');
        lines.push('');
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warroom-${session.name.replace(/\s+/g,'-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Agent Report helpers ──────────────────────────────────────────
  const EXPERTISE_LEVELS = ['Junior', 'Mid-Level', 'Senior', 'Principal', 'World-Class'];
  const REASONING_STYLES = ['Analytical', 'Intuitive', 'Contrarian', 'Systematic', 'Probabilistic'];
  const SEV_COLOR_AGENT = { CRITICAL: '#C0392B', HIGH: '#D68910', MEDIUM: '#2E86AB', LOW: '#27AE60' };

  const agentFiltered = agents.filter(a => {
    if (agentFilterDomain && a.domain_id !== agentFilterDomain) return false;
    if (agentFilterExpertise && a.expertise_level !== agentFilterExpertise) return false;
    if (agentFilterReasoning && a.reasoning_style !== agentFilterReasoning) return false;
    return true;
  });

  const toggleAgentSelection = (id) => {
    const s = new Set(selectedAgentIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedAgentIds(s);
  };

  const selectAllAgents = () => setSelectedAgentIds(new Set(agentFiltered.map(a => a.id)));
  const clearAgentSelection = () => setSelectedAgentIds(new Set());

  const agentsForReport = selectedAgentIds.size > 0
    ? agents.filter(a => selectedAgentIds.has(a.id))
    : agentFiltered;

  const printAgentReport = () => {
    if (agentsForReport.length === 0) return;
    const domainById = (id) => domains.find(d => d.id === id);

    const vectorBar = (label, val) => {
      const pct = Math.round((val || 0) * 100);
      const colors = { Human: '#D68910', Technical: '#2E86AB', Physical: '#C0392B', Futures: '#27AE60' };
      const c = colors[label] || '#F0A500';
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="width:72px;font-size:10px;color:#888;font-family:monospace;flex-shrink:0;">${label.toUpperCase()}</span>
          <div style="flex:1;height:6px;background:#EEEEEE;border-radius:3px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${c};border-radius:3px;"></div>
          </div>
          <span style="width:30px;text-align:right;font-size:10px;color:#888;font-family:monospace;">${pct}%</span>
        </div>`;
    };

    const sevBadge = (sev) => {
      const c = SEV_COLOR_AGENT[sev] || '#999';
      return `<span style="display:inline-block;background:${c};color:#fff;font-size:9px;font-weight:700;letter-spacing:1px;padding:2px 7px;border-radius:3px;font-family:monospace;">${sev || '—'}</span>`;
    };

    const groupByDomain = {};
    agentsForReport.forEach(a => {
      const domName = domainById(a.domain_id)?.name || 'No Domain';
      if (!groupByDomain[domName]) groupByDomain[domName] = [];
      groupByDomain[domName].push(a);
    });

    let html = `<!DOCTYPE html><html><head><title>Agent Roster Report</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Georgia', serif; color: #1a1a1a; background: #fff; font-size: 13px; line-height: 1.6; }
      .page { max-width: 900px; margin: 0 auto; padding: 60px 70px; }
      .cover { border-bottom: 4px solid #F0A500; padding-bottom: 48px; margin-bottom: 56px; }
      .cover-label { font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #B7770D; text-transform: uppercase; margin-bottom: 10px; }
      .cover-title { font-size: 36px; font-weight: 700; color: #0D1B2A; line-height: 1.2; margin-bottom: 6px; }
      .cover-sub { font-size: 16px; color: #666; margin-bottom: 24px; }
      .cover-meta { display: flex; gap: 28px; flex-wrap: wrap; border-top: 1px solid #E0E0E0; padding-top: 18px; }
      .meta-item .meta-label { font-size: 10px; font-family: monospace; letter-spacing: 1px; color: #999; text-transform: uppercase; margin-bottom: 2px; }
      .meta-item .meta-value { font-size: 13px; font-weight: 600; color: #333; }
      .domain-section { margin-bottom: 48px; }
      .domain-heading { font-family: monospace; font-size: 11px; letter-spacing: 3px; color: #B7770D; text-transform: uppercase; border-bottom: 2px solid #F0A500; padding-bottom: 6px; margin-bottom: 20px; }
      .agent-card { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 20px; border: 1px solid #E8E8E8; border-radius: 6px; margin-bottom: 16px; background: #FAFAFA; page-break-inside: avoid; }
      .agent-name { font-size: 16px; font-weight: 700; color: #0D1B2A; margin-bottom: 2px; }
      .agent-discipline { font-size: 12px; color: #666; margin-bottom: 10px; font-style: italic; }
      .tag-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
      .tag { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: #F0F0F0; color: #555; font-family: monospace; }
      .section-label { font-size: 10px; font-family: monospace; letter-spacing: 1px; color: #999; text-transform: uppercase; margin-bottom: 4px; }
      .section-value { font-size: 12px; color: #333; }
      .profile-block { font-size: 12px; color: #444; line-height: 1.7; }
      .summary-table { width: 100%; border-collapse: collapse; margin-top: 32px; margin-bottom: 48px; }
      .summary-table th { background: #F9F3E3; padding: 8px 12px; text-align: left; font-family: monospace; font-size: 10px; letter-spacing: 1px; color: #8B6914; border-bottom: 2px solid #F0A500; }
      .summary-table td { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #F0EAD6; }
      .summary-table tr:nth-child(even) td { background: #FFFDF7; }
      .footer { margin-top: 60px; padding-top: 14px; border-top: 1px solid #E0E0E0; font-size: 10px; color: #aaa; font-family: monospace; display: flex; justify-content: space-between; }
      @media print { .page { padding: 36px 48px; } }
    </style></head><body><div class="page">`;

    // Cover
    html += `<div class="cover">
      <div class="cover-label">AgentDebate — Red Team Intelligence Platform</div>
      <div class="cover-title">Agent Roster Report</div>
      <div class="cover-sub">Structured profiles for ${agentsForReport.length} analyst agent${agentsForReport.length !== 1 ? 's' : ''}</div>
      <div class="cover-meta">
        <div class="meta-item"><div class="meta-label">Generated</div><div class="meta-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
        <div class="meta-item"><div class="meta-label">Total Agents</div><div class="meta-value">${agentsForReport.length}</div></div>
        <div class="meta-item"><div class="meta-label">Domains</div><div class="meta-value">${Object.keys(groupByDomain).length}</div></div>
        ${agentFilterExpertise ? `<div class="meta-item"><div class="meta-label">Expertise Filter</div><div class="meta-value">${agentFilterExpertise}</div></div>` : ''}
        ${agentFilterReasoning ? `<div class="meta-item"><div class="meta-label">Reasoning Filter</div><div class="meta-value">${agentFilterReasoning}</div></div>` : ''}
      </div>
    </div>`;

    // Summary table
    html += `<div class="domain-heading">AGENT SUMMARY</div>
    <table class="summary-table">
      <thead><tr>
        <th>AGENT</th><th>DISCIPLINE</th><th>DOMAIN</th><th>EXPERTISE</th><th>REASONING</th><th>SEVERITY</th>
      </tr></thead><tbody>`;
    agentsForReport.forEach(a => {
      const dom = domainById(a.domain_id);
      html += `<tr>
        <td><strong>${a.name}</strong></td>
        <td>${a.discipline || '—'}</td>
        <td>${dom?.name || '—'}</td>
        <td>${a.expertise_level || '—'}</td>
        <td>${a.reasoning_style || '—'}</td>
        <td>${sevBadge(a.severity_default)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;

    // Agent cards by domain
    Object.entries(groupByDomain).forEach(([domName, domAgents]) => {
      html += `<div class="domain-section">
        <div class="domain-heading">${domName} — ${domAgents.length} Agent${domAgents.length !== 1 ? 's' : ''}</div>`;
      domAgents.forEach(a => {
        html += `<div class="agent-card">
          <div>
            <div class="agent-name">${a.name}</div>
            <div class="agent-discipline">${a.discipline || ''}</div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
              ${sevBadge(a.severity_default)}
              ${a.is_ai_generated ? `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#F3E8FF;color:#7B2D8B;font-family:monospace;">AI GENERATED</span>` : ''}
            </div>
            ${a.expertise_level ? `<div style="margin-bottom:6px;"><span class="section-label">Expertise</span><div class="section-value">${a.expertise_level}</div></div>` : ''}
            ${a.reasoning_style ? `<div style="margin-bottom:6px;"><span class="section-label">Reasoning Style</span><div class="section-value">${a.reasoning_style}</div></div>` : ''}
            ${a.tags?.length ? `<div class="tag-row">${a.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
          </div>
          <div>
            ${(a.vector_human !== undefined || a.vector_technical !== undefined) ? `
              <div style="margin-bottom:14px;">
                <span class="section-label" style="display:block;margin-bottom:6px;">Threat Vectors</span>
                ${vectorBar('Human', a.vector_human)}
                ${vectorBar('Technical', a.vector_technical)}
                ${vectorBar('Physical', a.vector_physical)}
                ${vectorBar('Futures', a.vector_futures)}
              </div>` : ''}
            ${a.persona_description ? `<div style="margin-bottom:10px;"><span class="section-label">Persona</span><p class="profile-block" style="margin-top:3px;">${a.persona_description}</p></div>` : ''}
            ${a.cognitive_bias ? `<div style="margin-bottom:10px;"><span class="section-label">Cognitive Bias</span><p class="profile-block" style="margin-top:3px;font-style:italic;">"${a.cognitive_bias}"</p></div>` : ''}
            ${a.red_team_focus ? `<div><span class="section-label">Red Team Focus</span><p class="profile-block" style="margin-top:3px;">${a.red_team_focus}</p></div>` : ''}
          </div>
        </div>`;
      });
      html += `</div>`;
    });

    html += `<div class="footer">
      <span>AgentDebate — Red Team Intelligence Platform</span>
      <span>CONFIDENTIAL — ${new Date().toLocaleDateString()}</span>
    </div>`;

    html += `</div><script>window.onload = function() { window.focus(); window.print(); };<\/script></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  return (
    <div style={{ backgroundColor: 'var(--wr-bg-primary)', minHeight: '100vh' }}>
      <PageHeader
        icon={BarChart3}
        title="REPORTS"
        subtitle="Export and share session outputs and scenario briefs"
      />

      {sessionParam && (
        <div className="px-6 pt-4">
          <Link data-ui="action" to={`/sessions/${sessionParam}`} className="text-xs font-mono inline-flex items-center gap-1 px-2 py-1 rounded"
            style={{ color: 'var(--wr-amber)', backgroundColor: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)', textDecoration: 'none' }}>
            ← Back to session · pre-selected below
          </Link>
        </div>
      )}

      <div className="p-6 max-w-3xl space-y-6">

        {/* ── Executive Report ──────────────────────────────────────── */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)', boxShadow: '0 0 20px rgba(240,165,0,0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-amber)' }}>EXECUTIVE REPORT</h2>

          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
            Full executive-grade PDF covering scenario overview, session findings, severity breakdown, and a break-the-chain worksheet for every threat chain linked to the scenario.
          </p>
          <WrSelect label="SELECT SESSION" value={selectedExecSession} onChange={setSelectedExecSession}>
            <option value="">Choose a session...</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.status?.toUpperCase()}</option>)}
          </WrSelect>

          {selectedExecSession && (
            <div className="mt-4">
              {execSession && (
                <div data-ui="surface" className="rounded p-3 mb-4 grid grid-cols-3 gap-3" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Scenario</p>
                    <p className="text-xs font-semibold" style={{ color: 'var(--wr-text-secondary)' }}>{execScenario?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Agents</p>
                    <p className="text-xs font-semibold" style={{ color: 'var(--wr-text-secondary)' }}>{execSessionAgents.length}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Chains Linked</p>
                    <p className="text-xs font-semibold" style={{ color: 'var(--wr-text-secondary)' }}>{execChains.length}</p>
                  </div>
                </div>
              )}
              <WrButton size="md" onClick={printExecutiveReport}>
                <FileText className="w-4 h-4" /> Generate Executive PDF
              </WrButton>
            </div>
          )}
        </div>

        {/* ── Agent Roster Report ───────────────────────────────────── */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>AGENT ROSTER REPORT</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
            Generate a fully formatted PDF roster for any selection of agents — filter by domain, expertise, reasoning style, or pick individual agents.
          </p>

          {/* Filters */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium mb-1 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>DOMAIN</label>
              <select value={agentFilterDomain} onChange={e => { setAgentFilterDomain(e.target.value); setSelectedAgentIds(new Set()); }}
                className="w-full px-3 py-1.5 text-xs rounded outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}>
                <option value="">All Domains</option>
                {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>EXPERTISE</label>
              <select value={agentFilterExpertise} onChange={e => { setAgentFilterExpertise(e.target.value); setSelectedAgentIds(new Set()); }}
                className="w-full px-3 py-1.5 text-xs rounded outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}>
                <option value="">All Levels</option>
                {EXPERTISE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>REASONING STYLE</label>
              <select value={agentFilterReasoning} onChange={e => { setAgentFilterReasoning(e.target.value); setSelectedAgentIds(new Set()); }}
                className="w-full px-3 py-1.5 text-xs rounded outline-none"
                style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-primary)' }}>
                <option value="">All Styles</option>
                {REASONING_STYLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Agent selection list */}
          {agentFiltered.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>
                  SELECT AGENTS <span style={{ color: 'var(--wr-text-muted)' }}>({selectedAgentIds.size > 0 ? `${selectedAgentIds.size} selected` : `all ${agentFiltered.length} filtered`})</span>
                </p>
                <div className="flex gap-2">
                  <button data-ui="action" onClick={selectAllAgents} className="text-xs" style={{ color: 'var(--wr-amber)' }}>Select All</button>
                  <span style={{ color: 'var(--wr-border)' }}>|</span>
                  <button data-ui="action" onClick={clearAgentSelection} className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>Clear</button>
                </div>
              </div>
              <div data-ui="surface" className="rounded p-2 max-h-48 overflow-y-auto" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                {agentFiltered.map(a => {
                  const dom = domains.find(d => d.id === a.domain_id);
                  const checked = selectedAgentIds.size === 0 || selectedAgentIds.has(a.id);
                  return (
                    <label key={a.id} className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-white/5">
                      <input type="checkbox" checked={selectedAgentIds.size === 0 ? true : selectedAgentIds.has(a.id)}
                        onChange={() => {
                          if (selectedAgentIds.size === 0) {
                            // First deselect: start with all selected minus this one
                            const s = new Set(agentFiltered.map(x => x.id));
                            s.delete(a.id);
                            setSelectedAgentIds(s);
                          } else {
                            toggleAgentSelection(a.id);
                          }
                        }}
                        className="accent-amber-500" />
                      <span className="text-xs font-medium flex-1" style={{ color: 'var(--wr-text-primary)' }}>{a.name}</span>
                      <span className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{a.discipline}</span>
                      {dom && <span data-ui="badge" className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: `${dom.color}22`, color: dom.color }}>{dom.name}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {agentFiltered.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>No agents match the current filters.</p>
          ) : (
            <WrButton size="md" onClick={printAgentReport}>
              <FileText className="w-4 h-4" /> Generate Agent PDF ({agentsForReport.length} agent{agentsForReport.length !== 1 ? 's' : ''})
            </WrButton>
          )}
        </div>

        {/* ── Scenario Brief Export ─────────────────────────────────── */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>SCENARIO BRIEF EXPORT</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
            Export a scenario's operational brief as a Markdown file or formatted PDF to share with stakeholders before running a simulation.
          </p>
          <WrSelect label="SELECT SCENARIO" value={selectedScenario} onChange={setSelectedScenario}>
            <option value="">Choose a scenario...</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name} — {s.status?.toUpperCase()}</option>)}
          </WrSelect>

          {scenarioForExport && (
            <div className="mt-4">
              <div data-ui="surface" className="rounded p-3 mb-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--wr-text-secondary)' }}>{scenarioForExport.name}</p>
                {scenarioForExport.description && <MarkdownContent className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{scenarioForExport.description}</MarkdownContent>}
                <p className="text-xs mt-1" style={{ color: 'var(--wr-text-muted)' }}>
                  {scenarioForExport.context_document?.length || 0} characters in context document
                </p>
              </div>
              <div className="flex gap-3">
                <WrButton onClick={exportScenarioMarkdown}>
                  <Download className="w-4 h-4" /> Export Markdown
                </WrButton>
                <WrButton variant="secondary" onClick={exportScenarioPdf}>
                  <FileText className="w-4 h-4" /> Export PDF
                </WrButton>
              </div>
            </div>
          )}
        </div>

        {/* ── Chain Report Export ───────────────────────────────────── */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>CHAIN REPORT EXPORT</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--wr-text-muted)' }}>
            Export a chain's full multi-step narrative and agent attributions as a structured Markdown file.
          </p>
          <WrSelect label="SELECT CHAIN" value={selectedChain} onChange={setSelectedChain}>
            <option value="">Choose a chain...</option>
            {chains.map(c => <option key={c.id} value={c.id}>{c.name} — {c.steps?.length || 0} steps</option>)}
          </WrSelect>

          {chainForExport && (
            <div className="mt-4">
              <div data-ui="surface" className="rounded p-3 mb-4" style={{ backgroundColor: 'var(--wr-bg-secondary)', border: '1px solid var(--wr-border)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--wr-text-secondary)' }}>{chainForExport.name}</p>
                {chainForExport.description && <MarkdownContent className="text-xs mb-1" style={{ color: 'var(--wr-text-muted)' }}>{chainForExport.description}</MarkdownContent>}
                <p className="text-xs" style={{ color: 'var(--wr-text-muted)' }}>{chainForExport.steps?.length || 0} steps · {chainForExport.is_ai_generated ? 'AI Generated' : 'Manual'}</p>
              </div>
              <WrButton onClick={exportChainMarkdown}>
                <Download className="w-4 h-4" /> Export Markdown
              </WrButton>
            </div>
          )}
        </div>

        {/* ── Session Report Builder ────────────────────────────────── */}
        <div data-ui="surface" className="rounded p-5" style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
            <h2 className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>SESSION REPORT BUILDER</h2>
          </div>
          <WrSelect label="SELECT SESSION" value={selectedSession} onChange={setSelectedSession}>
            <option value="">Choose a session...</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} — {s.status?.toUpperCase()}</option>)}
          </WrSelect>

          {selectedSession && (
            <div className="mt-4">
              <p className="text-xs font-medium mb-2 tracking-wide" style={{ color: 'var(--wr-text-secondary)' }}>INCLUDE SECTIONS</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 mb-5">
                {SECTIONS.map(s => (
                  <label key={s.key} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={selectedSections.has(s.key)} onChange={() => toggleSection(s.key)} className="accent-amber-500" />
                    <span className="text-sm" style={{ color: 'var(--wr-text-secondary)' }}>{s.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <WrButton onClick={exportMarkdown}>
                  <Download className="w-4 h-4" /> Export Markdown
                </WrButton>
                <WrButton variant="secondary" onClick={printReport}>
                  <FileText className="w-4 h-4" /> Print / PDF
                </WrButton>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}