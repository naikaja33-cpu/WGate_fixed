import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Pin, Trash2, Megaphone, BookOpen, Calendar, Wrench, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NoticeCard from '@/components/notices/NoticeCard';
import AddNoticeModal from '@/components/notices/AddNoticeModal';
import { format } from 'date-fns';

export default function NoticeBoard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'guard';
  const [showAdd, setShowAdd] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: notices = [], isLoading } = useQuery({
    queryKey: ['notices', user?.society_id],
    queryFn: () => base44.entities.Notice.filter({ society_id: user?.society_id }, '-created_date', 100),
    enabled: !!user?.society_id,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Notice.create({
      ...data,
      society_id: user.society_id,
      society_name: user.society_name,
      posted_by: user.full_name,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      setShowAdd(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Notice.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notices'] }),
  });

  const togglePinMutation = useMutation({
    mutationFn: ({ id, is_pinned }) => base44.entities.Notice.update(id, { is_pinned: !is_pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notices'] }),
  });

  const filtered = typeFilter === 'all' ? notices : notices.filter(n => n.type === typeFilter);
  const pinned = filtered.filter(n => n.is_pinned);
  const unpinned = filtered.filter(n => !n.is_pinned);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Notice Board</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{user?.society_name}</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> Post Notice
          </Button>
        )}
      </div>

      <Tabs value={typeFilter} onValueChange={setTypeFilter}>
        <TabsList className="w-full bg-muted">
          <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
          <TabsTrigger value="announcement" className="flex-1 text-xs">News</TabsTrigger>
          <TabsTrigger value="event" className="flex-1 text-xs">Events</TabsTrigger>
          <TabsTrigger value="rule" className="flex-1 text-xs">Rules</TabsTrigger>
          <TabsTrigger value="maintenance" className="flex-1 text-xs">Maintenance</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No notices posted yet</div>
      ) : (
        <div className="space-y-3">
          {pinned.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Pin className="w-3 h-3" /> PINNED</p>
              {pinned.map(n => (
                <NoticeCard key={n.id} notice={n} isAdmin={isAdmin}
                  onDelete={() => deleteMutation.mutate(n.id)}
                  onTogglePin={() => togglePinMutation.mutate({ id: n.id, is_pinned: n.is_pinned })} />
              ))}
              {unpinned.length > 0 && <p className="text-xs font-semibold text-muted-foreground pt-1">RECENT</p>}
            </>
          )}
          {unpinned.map(n => (
            <NoticeCard key={n.id} notice={n} isAdmin={isAdmin}
              onDelete={() => deleteMutation.mutate(n.id)}
              onTogglePin={() => togglePinMutation.mutate({ id: n.id, is_pinned: n.is_pinned })} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddNoticeModal
          onSubmit={(data) => createMutation.mutate(data)}
          onClose={() => setShowAdd(false)}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}
