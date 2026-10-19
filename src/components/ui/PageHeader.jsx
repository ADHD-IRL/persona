export default function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5 border-b" 
      style={{ borderColor: 'var(--wr-border)' }}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-8 h-8 rounded flex items-center justify-center"
            style={{ backgroundColor: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.2)' }}>
            <Icon className="w-4 h-4" style={{ color: 'var(--wr-amber)' }} />
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold tracking-wide" style={{ color: 'var(--wr-text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
            {title}
          </h1>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--wr-text-muted)' }}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}