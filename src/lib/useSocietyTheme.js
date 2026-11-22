import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { wgate } from '@/api/wgateClient';
import { useAuth } from '@/lib/AuthContext';
import { applyTheme } from '@/lib/themes';

// Reads the theme the super admin chose for this society and applies it.
export function useSocietyTheme() {
  const { user } = useAuth();
  const societyId = user?.society_id;

  const { data } = useQuery({
    queryKey: ['society-theme', societyId],
    queryFn: async () => {
      const results = await wgate.entities.SocietySettings.filter({ society_id: societyId });
      return results[0]?.theme || 'default';
    },
    enabled: !!societyId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data) applyTheme(data);
  }, [data]);
}