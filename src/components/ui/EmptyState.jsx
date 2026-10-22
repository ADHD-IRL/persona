import MarkdownContent from '@/components/ui/MarkdownContent';
import { Button } from '@/components/ui/button';

export default function EmptyState({ icon: Icon, title, description, action, actionLabel }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: 'var(--wr-bg-card)', border: '1px solid var(--wr-border)' }}>
        {Icon && <Icon className="w-7 h-7" style={{ color: 'var(--wr-text-muted)' }} />}
      </div>
      <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--wr-text-primary)' }}>{title}</h3>
      <MarkdownContent className="text-sm max-w-md mb-6" style={{ color: 'var(--wr-text-secondary)' }}>{description}</MarkdownContent>
      {action && (
        <Button onClick={action} className="bg-amber-500 hover:bg-amber-400 text-black font-semibold">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}