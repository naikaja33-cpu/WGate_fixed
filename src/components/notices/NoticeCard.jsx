import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pin, PinOff, Trash2, Megaphone, BookOpen, Calendar, Wrench, FileText } from 'lucide-react';
import { format } from 'date-fns';

const typeConfig = {
  announcement: { label: 'Announcement', icon: Megaphone, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  rule: { label: 'Rule', icon: BookOpen, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  event: { label: 'Event', icon: Calendar, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  maintenance: { label: 'Maintenance', icon: Wrench, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  other: { label: 'Other', icon: FileText, color: 'bg-muted text-muted-foreground border-border' },
};

export default function NoticeCard({ notice, isAdmin, onDelete, onTogglePin }) {
  const config = typeConfig[notice.type] || typeConfig.other;
  const Icon = config.icon;

  return (
    <div className={`bg-card rounded-2xl border p-4 space-y-2 transition-all hover:shadow-md ${notice.is_pinned ? 'border-primary/30 bg-accent/20' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color.split(' ').slice(0,2).join(' ')}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm leading-tight">{notice.title}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={`text-xs border ${config.color}`}>{config.label}</Badge>
              {notice.is_pinned && (
                <span className="flex items-center gap-0.5 text-xs text-primary font-medium">
                  <Pin className="w-3 h-3" /> Pinned
                </span>
              )}
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={onTogglePin} title={notice.is_pinned ? 'Unpin' : 'Pin'}>
              {notice.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed pl-10">{notice.content}</p>

      <div className="flex items-center justify-between pl-10 text-xs text-muted-foreground">
        <span>By {notice.posted_by || 'Admin'}</span>
        <div className="flex items-center gap-3">
          {notice.event_date && (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <Calendar className="w-3 h-3" /> {format(new Date(notice.event_date), 'MMM d, yyyy')}
            </span>
          )}
          <span>{notice.created_date ? format(new Date(notice.created_date), 'MMM d') : ''}</span>
        </div>
      </div>
    </div>
  );
}
