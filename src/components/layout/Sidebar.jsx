import {useWorkspace} from '@/lib/WorkspaceContext';
import {apiRequest} from '@/lib/apiClient';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Globe, Target, AlertTriangle, Bot, Link2, Wifi, Map, ChevronDown, ChevronRight,
  Shield, BookOpen, Brain, GitCompare, Settings2, GitBranch, BookMarked, Braces,
} from 'lucide-react';

// Keep session review separate from preparing inputs and running debates.
const groups = [
  {
    title: 'Manage',
    items: [
      { path: '/session-tracker', icon: Shield, label: 'Session Tracker' },
      { path: '/session-summary', icon: BookOpen, label: 'Session Summary' },
      { path: '/reports', icon: BookMarked, label: 'Reports' },
    ],
  },
  {
    title: 'Prepare',
    items: [
      { path: '/scenarios', icon: Target, label: 'Scenarios' },
      { path: '/decisions', icon: GitBranch, label: 'Decisions' },
      { path: '/knowledge', icon: BookMarked, label: 'Knowledge Base' },
    ],
  },
  {
    title: 'Run',
    items: [
      { path: '/analysis', icon: Target, label: 'Agent Debate' },
      { path: '/panel-room', icon: Bot, label: 'Panel Room' },
    ],
  },
  {
    title: 'Library',
    items: [
      { path: '/agents', icon: Bot, label: 'SME' },
      { path: '/domains', icon: Globe, label: 'Domains' },
      { path: '/threats', icon: AlertTriangle, label: 'Threats' },
      { path: '/chains', icon: Link2, label: 'Chains' },
    ],
  },
  {
    title: 'Insights',
    defaultCollapsed: true,
    items: [
      { path: '/threatmap', icon: Map, label: 'Threat Map' },
      { path: '/agent-analytics', icon: Brain, label: 'SME Analytics' },
      { path: '/compare', icon: GitCompare, label: 'Compare Sessions' },
      { path: '/prompts', icon: Braces, label: 'Prompt Library' },
    ],
  },
];

const sessionPaths=new Set(['/session-tracker','/session-summary','/reports']);
const footer = [
  { path: '/settings', icon: Settings2, label: 'Settings' },
  { path: '/guide',    icon: BookOpen,  label: 'User Guide' },
];

function NavGroup({ group, isActive }) {
  const {workspace}=useWorkspace();
  const {pathname}=useLocation();
  const contentId=useId();
  const storageKey='agd_sidebar_'+workspace.id+'_'+group.title;
  const hasActiveChild=group.items.some(i=>isActive(i.path));
  const [open,setOpen]=useState(()=>{
    try{const saved=localStorage.getItem(storageKey);if(saved!==null)return saved==='open';}catch{/* preferences are optional */}
    return hasActiveChild||!group.defaultCollapsed;
  });
  const previousPath=useRef(pathname);
  // Reveal the destination on navigation, while allowing the active group to collapse.
  useEffect(()=>{
    if(previousPath.current!==pathname&&hasActiveChild){setOpen(true);try{localStorage.setItem(storageKey,'open');}catch{/* optional */}}
    previousPath.current=pathname;
  },[pathname,hasActiveChild,storageKey]);
  const toggle=()=>{const next=!open;setOpen(next);try{localStorage.setItem(storageKey,next?'open':'closed');}catch{/* optional */}};
  return <div className="mt-2">
    <button type="button" data-ui="disclosure" onClick={toggle} aria-expanded={open} aria-controls={contentId}
      className="w-full min-h-10 flex items-center justify-between px-5 py-2 text-left rounded-lg hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
      style={{color:hasActiveChild?'var(--wr-amber)':'var(--wr-text-muted)'}}>
      <span className="text-xs font-bold tracking-widest font-mono">{group.title.toUpperCase()}</span>
      {open?<ChevronDown aria-hidden="true" className="w-4 h-4 shrink-0"/>:<ChevronRight aria-hidden="true" className="w-4 h-4 shrink-0"/>}
    </button>
    <div id={contentId} hidden={!open}>{group.items.map(item=><NavLink key={item.path} {...item} active={isActive(item.path)}/>)}</div>
  </div>;
}

function NavLink({ path, icon: Icon, label, active, compact = false }) {
 const {workspace}=useWorkspace();const location=useLocation();let sessionId=new URLSearchParams(location.search).get('session')||location.pathname.match(/^\/sessions\/([^/]+)/)?.[1]||'';if(!sessionId)try{sessionId=localStorage.getItem('agd_selected_session_'+workspace.id)||'';}catch{/* optional */}
  return (
    <Link data-ui="action"
      to={sessionPaths.has(path)&&sessionId?path+'?session='+encodeURIComponent(sessionId):path}
      aria-current={active ? 'page' : undefined}
      className={`sidebar-link flex items-center gap-3 px-5 ${compact ? 'py-1.5' : 'py-2'} mx-2 rounded text-sm font-medium transition-all duration-150`}
      style={{
        color: active ? 'var(--wr-amber)' : compact ? 'var(--wr-text-muted)' : 'var(--wr-text-secondary)',
        backgroundColor: active ? 'rgba(240,165,0,0.1)' : 'transparent',
        borderColor: active ? 'var(--wr-amber)' : 'var(--wr-border-strong)',
      }}
    >
      <Icon className={compact ? 'w-3.5 h-3.5 flex-shrink-0' : 'w-4 h-4 flex-shrink-0'} />
      <span className="tracking-wide">{label}</span>
    </Link>
  );
}

export default function Sidebar({ stats }) {
  const {workspace}=useWorkspace();
  const [connection,setConnection]=useState('Not checked');
  useEffect(()=>{let live=true,pending=false;const check=async()=>{if(pending)return;pending=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{const result=await apiRequest('/api/health',{signal:controller.signal});if(live)setConnection(result.status==='ok'?'Server connected':'Server unavailable');}catch{if(live)setConnection('Server unavailable');}finally{clearTimeout(timer);pending=false;}};void check();const timer=setInterval(check,30000);return()=>{live=false;clearInterval(timer);};},[]);
  const location = useLocation();
  const isActive = (path) =>
    (path === '/panel-room' && location.pathname.startsWith('/sessions/') && location.pathname.endsWith('/panel')) || location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  return (
    <div className="fixed left-0 top-0 h-full w-56 flex flex-col z-50"
      style={{ backgroundColor: 'var(--wr-bg-secondary)', borderRight: '1px solid var(--wr-border)' }}>

      {/* Logo */}
      <Link data-ui="brand" to="/session-tracker" className="px-5 py-5 border-b block" style={{ borderColor: 'var(--wr-border)', textDecoration: 'none' }}>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" style={{ color: 'var(--wr-amber)' }} />
          <span className="text-lg font-bold tracking-widest" style={{ color: 'var(--wr-amber)', fontFamily: 'JetBrains Mono, monospace' }}>
            AgentDebate
          </span>
        </div>
      </Link>

      {/* Nav */}
      <nav aria-label="Main navigation" className="flex-1 py-1 overflow-y-auto flex flex-col">
        {groups.map(group => (
          <NavGroup key={workspace.id+group.title} group={group} isActive={isActive} />
        ))}
      </nav>

      {/* Footer: settings, guide, status */}
      <div className="border-t py-2" style={{ borderColor: 'var(--wr-border)' }}>
        {footer.map(item => (
          <NavLink key={item.path} {...item} active={isActive(item.path)} compact />
        ))}
        <div className="px-5 pt-2 pb-1 flex items-center justify-between text-xs" style={{ color: 'var(--wr-text-muted)' }}>
          <span role="status" aria-live="polite" title="Local server and database health; model availability is tested in Settings." className="flex items-center gap-1.5"><Wifi className={'w-3 h-3 '+(connection==='Server connected'?'text-green-500':'text-amber-400')} /> {connection}</span>
          <span>{stats?.agentCount ?? 0} SMEs · {stats?.activeSessions ?? 0} active</span>
        </div>
      </div>
    </div>
  );
}
