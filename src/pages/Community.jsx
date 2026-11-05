import { useState } from 'react';
import { wgate } from '@/api/wgateClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PostCard from '@/components/community/PostCard';
import PostFormModal from '@/components/community/PostFormModal';

export default function Community() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canPost = isAdmin || user?.role === 'owner' || user?.role === 'tenant';
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // the post being edited
  const [tab, setTab] = useState('all');
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['community-posts'],
    queryFn: () => wgate.entities.ClassifiedPost.list('-created_date', 300),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['community-posts'] });

  const createMutation = useMutation({
    mutationFn: (data) => wgate.entities.ClassifiedPost.create(data),
    onSuccess: refresh,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => wgate.entities.ClassifiedPost.update(id, data),
    onSuccess: refresh,
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => wgate.entities.ClassifiedPost.delete(id),
    onSuccess: refresh,
  });

  const myEmail = String(user?.email || '').toLowerCase();
  const isMine = (p) => !!myEmail && String(p.resident_email || '').toLowerCase() === myEmail;

  // Everyone sees open posts; you also see your own closed ones, and the admin sees all.
  const visible = posts.filter((p) => p.status !== 'closed' || isMine(p) || isAdmin);
  const filtered = visible.filter((p) => {
    if (tab === 'all') return true;
    if (tab === 'mine') return isMine(p);
    return p.category === tab;
  });
  // Open posts first, closed ones at the bottom (the newest-first order is kept).
  const sorted = [...filtered].sort((a, b) => (a.status === 'closed') - (b.status === 'closed'));

  const handleSubmit = async (data) => {
    if (editing) await updateMutation.mutateAsync({ id: editing.id, data });
    else await createMutation.mutateAsync(data);
    setShowForm(false);
    setEditing(null);
  };

  const handleToggleStatus = (post) =>
    updateMutation.mutate({ id: post.id, data: { status: post.status === 'closed' ? 'active' : 'closed' } });

  const handleDelete = (post) => {
    if (window.confirm(`Delete "${post.title}"? This cannot be undone.`)) deleteMutation.mutate(post.id);
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Community</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Rent, sale and ads from your neighbours</p>
        </div>
        {canPost && (
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> New Post
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full bg-muted">
          <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
          <TabsTrigger value="flat_rent" className="flex-1 text-xs">Rent</TabsTrigger>
          <TabsTrigger value="flat_sale" className="flex-1 text-xs">Sale</TabsTrigger>
          <TabsTrigger value="items" className="flex-1 text-xs">Items</TabsTrigger>
          <TabsTrigger value="ad" className="flex-1 text-xs">Ads</TabsTrigger>
          <TabsTrigger value="mine" className="flex-1 text-xs">Mine</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {tab === 'mine' ? 'You have not posted anything yet' : 'No posts yet. Be the first to post.'}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isMine={isMine(post)}
              isAdmin={isAdmin}
              onEdit={(p) => { setEditing(p); setShowForm(true); }}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showForm && (
        <PostFormModal
          post={editing}
          defaultPhone={user?.phone || ''}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}