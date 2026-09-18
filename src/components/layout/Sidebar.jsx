import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Globe, Target, AlertTriangle, Bot, Link2, Swords, Wifi, Map, ChevronDown, ChevronRight,
  Shield, BookOpen, Brain, GitCompare, Settings2, GitBranch, BookMarked, Braces,
} from 'lucide-react';

// The session is the hub. Everything analytical (kill chains, chain breaker,
// what-if, mitigations, reports) lives inside a session, so the sidebar only
// needs two ideas: the work you're doing, and the library it draws on.
// Cross-session views are tucked under "More" so the primary path stays short.
const groups = [
  {
    title: 'Work',
    items: [
      { path: '/sessions',  icon: Swords,    label: 'Sessions' },
      { path: '/decisions', icon: GitBranch, label: 'Decisions' },
      { path: '/scenarios', icon: Target,    label: 'Scenarios' },
    ],
  },
  {
    title: 'Library',
    items: [
      { path: '/agents',    icon: Bot,        label: 'Agents' },
      { path: '/domains',   icon: Globe,      label: 'Domains' },
      { path: '/threats',   icon: AlertTriangle, label: 'Threats' },
      { path: '/chains',    icon: Link2,      label: 'Chains' },
      { path: '/knowledge', icon: BookMarked, label: 'Knowledge Base' },
    ],
  },
  {
    title: 'More',
    collapsible: true,
    items: [
      { path: '/threatmap',       icon: Map,        label: 'Threat Map' },
      { path: '/agent-analytics', icon: Brain,      label: 'Agent Analytics' },
      { path: '/compare',         icon: GitCompare, label: 'Compare Sessions' },
      { path: '/prompts',         icon: Braces,     label: 'Prompt Library' },
    ],
  },
];

const footer = [
  { path: '/settings', icon: Settings2, label: 'Settings' },
  { path: '/guide',    icon: BookOpen,  label: 'User Guide' },
];

function NavGroup({ group, isActive }) {
  const hasActiveChild = group.items.some(i => isActive(i.path));
  // Collapsed by default; opens automatically when you're inside one of its pages.
  const [open, setOpen] = useState(!group.collapsible || hasActiveChild);
  const expanded = group.collapsible ? (open || hasActiveChild) : true;

  return (
    <div className="mt-4">
      {group.collapsible ? (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 pb-1 text-left"
        >
          <p className="text-xs font-bold tracking-widest font-mono" style={{ color: hasActiveChild ? 'var(--wr-amber)' : 'var(--wr-text-muted)' }}>
            {group.title.toUpperCase()}
          </p>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />
            : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--wr-text-muted)' }} />}
        </button>
      ) : (
        <p className="px-5 pb-1 text-xs font-bold tracking-widest font-mono" style={{ color: 'var(--wr-text-muted)' }}>
          {group.title.toUpperCase()}
        </p>
      )}
      {expanded && group.items.map(item => (
        <NavLink key={item.path} {...item} active={isActive(item.path)} />
      ))}
    </div>
  );
}

function NavLink({ path, icon: Icon, label, active, compact = false }) {
  return (
    <Link
      to={path}
      className={`flex items-center gap-3 px-5 ${compact ? 'py-1.5' : 'py-2'} mx-2 rounded text-sm font-medium transition-all duration-150`}
      style={{
        color: active ? 'var(--wr-amber)' : compact ? 'var(--wr-text-muted)' : 'var(--wr-text-secondary)',
        backgroundColor: active ? 'rgba(240,165,0,0.1)' : 'transparent',
        borderLeft: active ? '2px solid var(--wr-amber)' : '2px solid transparent',
      }}
    >
      <Icon className={compact ? 'w-3.5 h-3.5 flex-shrink-0' : 'w-4 h-4 flex-shrink-0'} />
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
      <Link to="/sessions" className="px-5 py-5 border-b block" style={{ borderColor: 'var(--wr-border)', textDecoration: 'none' }}>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" style={{ color: 'var(--wr-amber)' }} />
          <span className="text-lg font-bold tracking-widest" style={{ color: 'var(--wr-amber)', fontFamily: 'JetBrains Mono, monospace' }}>
            AgentDebate
          </span>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 py-1 overflow-y-auto flex flex-col">
        {groups.map(group => (
          <NavGroup key={group.title} group={group} isActive={isActive} />
        ))}
      </nav>

      {/* Footer: settings, guide, status */}
      <div className="border-t py-2" style={{ borderColor: 'var(--wr-border)' }}>
        {footer.map(item => (
          <NavLink key={item.path} {...item} active={isActive(item.path)} compact />
        ))}
        <div className="px-5 pt-2 pb-1 flex items-center justify-between text-xs" style={{ color: 'var(--wr-text-muted)' }}>
          <span className="flex items-center gap-1.5"><Wifi className="w-3 h-3 text-green-500" /> API</span>
          <span>{stats?.agentCount ?? 0} agents · {stats?.activeSessions ?? 0} active</span>
        </div>
      </div>
    </div>
  );
}
