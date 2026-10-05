import { useQuery } from '@tanstack/react-query';
import { wgate } from '@/api/wgateClient';
import { useAuth } from '@/lib/AuthContext';

export const MENU_KEYS = ['Visitors', 'ServiceTickets', 'NoticeBoard', 'Billing'];

/**
 * Which menu sections the super admin has switched on for the signed-in
 * user's society. `enabledMenus` is null when nothing has been configured
 * (everything is on). Shared by the nav, the page guard and the Dashboard.
 */
export function useEnabledMenus() {
  const { user } = useAuth();
  const societyId = user?.society_id;

  const { data, isLoading } = useQuery({
    queryKey: ['society-menus', societyId],
    queryFn: async () => {
      const results = await wgate.entities.SocietySettings.filter({ society_id: societyId });
      return results[0]?.enabled_menus ?? null;
    },
    enabled: !!societyId,
    staleTime: 30_000,
  });

  const enabledMenus = data ?? null;
  const isEnabled = (key) => !enabledMenus || enabledMenus.includes(key);

  return { enabledMenus, isEnabled, isLoaded: !societyId || !isLoading };
}