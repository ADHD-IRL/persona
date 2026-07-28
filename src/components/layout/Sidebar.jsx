import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Globe, Target, AlertTriangle,
  Bot, Link2, Swords, BarChart3, Wifi, Map, ChevronDown, ChevronRight,
  Shield, BookOpen, Brain, GitCompare, Settings2, Scissors, FlaskConical, ShieldCheck, GitBranch, BookMarked, Braces
} from 'lucide-react';

// Menu is ordered as the actual workflow: build a reusable library, plan the
// engagement, run the red team, review the output. Kill chains, chain breaking,
// mitigations and coverage all live INSIDE a session now — the cross-session
// versions are roll-up libraries, collapsed under "Analyze" so the primary
// path stays short.
const primary = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
];

const groups = [
  {
    title: '1 · Build',
    hint: 'Your reusable panel & taxonomy',
    items: [
      { path: '/domains', icon: Globe, label: 'Domains' },
      { path: '/agents', icon: Bot, label: 'Agents' },
      { path: '/knowledge', icon: BookMarked, label: 'Knowledge Base' },
    ],
  },
  {
    title: '2 · Plan',
    hint: 'What you want to stress-test',
    items: [
      { path: '/decisions', icon: GitBranch, label: 'Decisions' },
      { path: '/scenarios', icon: Target, label: 'Scenarios' },
    ],
  },
  {
    title: '3 · Run',
    hint: 'The red-team analysis',
    items: [
      { path: '/sessions', icon: Swords, label: 'Sessions' },
      { path: '/simulator', icon: FlaskConical, label: 'What-If Simulator' },
    ],
  },
  {
    title: '4 · Review',
    hint: 'Share what the session found',
    items: [
      { path: '/reports', icon: BarChart3, label: 'Reports' },
    ],
  },
  {
    title: 'Analyze',
    hint: 'Cross-session libraries',
    collapsible: true,
    items: [
      { path: '/threatmap', icon: Map, label: 'Threat Map' },
      { path: '/threats', icon: AlertTriangle, label: 'Threats' },
      { path: '/chains', icon: Link2, label: 'Chains' },
      { path: '/chain-breaker', icon: Scissors, label: 'Chain Breaker' },
      { path: '/mitigations', icon: ShieldCheck, label: 'Mitigations' },
      { path: '/agent-analytics', icon: Brain, label: 'Agent Analytics' },
      { path: '/compare', icon: GitCompare, label: 'Compare' },
    ],
  },
  {
    title: 'System',
    items: [
      { path: '/settings', icon: Settings2, label: 'Settings' },
      { path: '/guide', icon: BookOpen, label: 'User Guide' },
      { path: '/prompts', icon: Braces, label: 'Prompt Library' },
    ],
  },
];

function NavGroup({ group, isActive }) {
  const hasActiveChild = group.items.some(i => isActive(i.path));
  // Collapsed by default; opens automatically when you're inside one of its pages.
  const [open, setOpen] = useState(!group.collapsible || hasActiveChild);
  const expanded = group.collapsible ? (open || hasActiveChild) : true;

  return (
    <div>
      <div className="mx-4 mt-3 mb-1 border-t" style={{ borderColor: 'var(--wr-border)' }} />
      {group.collapsible ? (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 pt-1 pb-0.5 text-left"
        >
          <div>
            <p className="text-xs font-bold tracking-widest font-mono" style={{ color: hasActiveChild ? 'var(--wr-amber)' : 'var(--wr-text-muted)' }}>
              {group.title.toUpperCase()}
            </p>
            {group.hint && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)', opacity: 0.55 }}>{group.hint}</p>
            )}
          </div>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
            : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />}
        </button>
      ) : (
        <div className="px-5 pt-1 pb-0.5">
          <p className="text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
            {group.title.toUpperCase()}
          </p>
          {group.hint && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)', opacity: 0.55 }}>{group.hint}</p>
          )}
        </div>
      )}
      {expanded && group.items.map(item => (
        <NavLink key={item.path} {...item} active={isActive(item.path)} />
      ))}
    </div>
  );
}

function NavLink({ path, icon: Icon, label, active }) {
  return (
    <Link
      to={path}
      className="flex items-center gap-3 px-5 py-2 mx-2 rounded text-sm font-medium transition-all duration-150"
      style={{
        color: active ? 'var(--wr-amber)' : 'var(--wr-text-secondary)',
        backgroundColor: active ? 'rgba(240,165,0,0.1)' : 'transparent',
        borderLeft: active ? '2px solid var(--wr-amber)' : '2px solid transparent',
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="tracking-wide">{label}</span>
    </Link>
  );
}

export default function Sidebar({ stats }) {
  const location = useLocation();
  const isActive = (path) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  return (
    <div className="fixed left-0 top-0 h-full w-56 flex flex-col z-50"
      style={{ backgroundColor: 'var(--wr-bg-secondary)', borderRight: '1px solid var(--wr-border)' }}>

      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--wr-border)' }}>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" style={{ color: 'var(--wr-amber)' }} />
          <span className="text-lg font-bold tracking-widest" style={{ color: 'var(--wr-amber)', fontFamily: 'JetBrains Mono, monospace' }}>
            AgentDebate
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto flex flex-col">
        <div className="mb-1">
          {primary.map(item => (
            <NavLink key={item.path} {...item} active={isActive(item.path)} />
          ))}
        </div>

        {groups.map(group => (
          <NavGroup key={group.title} group={group} isActive={isActive} />
        ))}
      </nav>

      {/* Status bar */}
      <div className="px-4 py-4 border-t text-xs space-y-2" style={{ borderColor: 'var(--wr-border)' }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--wr-text-muted)' }}>
          <Wifi className="w-3 h-3 text-green-500" />
          <span>API Connected</span>
        </div>
        <div className="flex justify-between" style={{ color: 'var(--wr-text-muted)' }}>
          <span>{stats?.agentCount ?? 0} agents</span>
          <span>{stats?.activeSessions ?? 0} active sessions</span>
        </div>
      </div>
    </div>
  );
}
