import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { wgate ,ENTITY_NAMES } from '@/api/wgateClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

const NotificationContext = createContext({ notifications: [], unreadCount: 0, markAllRead: () => {} });

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const prevTicketStatuses = useRef({});
  const queryClient = useQueryClient();
  const addNotification = (notif) => {
    setNotifications(prev => [{ id: Date.now(), read: false, time: new Date(), ...notif }, ...prev].slice(0, 50));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
      if (!user || user.role === 'superadmin' || user.dues_blocked) return;
    const role = user.role || 'tenant';
    const isResident = role === 'tenant' || role === 'owner'|| role === 'family';

    // Visitor subscription — notify resident when a visitor checks in for their flat
    const unsubVisitor = wgate.entities.Visitor.subscribe((event) => {
      if (event.type !== 'create') return;
      const v = event.data;

      const isMyFlat = isResident && user.flat_number && v.flat_number === user.flat_number;
      const isAdminOrGuard = role === 'admin' || role === 'guard';

      if (isMyFlat || isAdminOrGuard) {
        const msg = `🚶 ${v.visitor_name} checked in at Flat ${v.flat_number} (${v.purpose})`;
        addNotification({ title: 'New Visitor', message: msg, type: 'visitor' });
        toast.info(msg, { duration: 5000 });
      }
    });

    // Service ticket subscription — notify on status update
    const unsubTicket = wgate.entities.ServiceTicket.subscribe((event) => {
      if (event.type !== 'update') return;
      const t = event.data;

      const isMyTicket = isResident && user.email && t.resident_email === user.email;
      const isAdmin = role === 'admin';

      if (isMyTicket) {
        const msg = `🔧 Your ticket "${t.title}" is now ${t.status?.replace('_', ' ')}`;
        addNotification({ title: 'Ticket Updated', message: msg, type: 'ticket' });
        toast.success(msg, { duration: 5000 });
      } else if (isAdmin) {
        const msg = `🔧 Ticket "${t.title}" updated to ${t.status?.replace('_', ' ')}`;
        addNotification({ title: 'Ticket Updated', message: msg, type: 'ticket' });
        toast.info(msg, { duration: 4000 });
      }
    });

    // Also subscribe to visitor status updates (approval/rejection)
    const unsubVisitorUpdate = wgate.entities.Visitor.subscribe((event) => {
      if (event.type !== 'update') return;
      const v = event.data;
      if (!v.status || v.status === 'pending' || v.status === 'expired') return;

      const isMyFlat = isResident && user.flat_number && v.flat_number === user.flat_number;
      if (isMyFlat) {
        const emoji = v.status === 'approved' ? '✅' : '❌';
        const msg = `${emoji} Visitor ${v.visitor_name} was ${v.status}`;
        addNotification({ title: 'Visitor Update', message: msg, type: 'visitor' });
        toast[v.status === 'approved' ? 'success' : 'error'](msg, { duration: 5000 });
      }
    });

    // New things that need an admin or a guard: a booking request, a pre-approval, a gate pass, a service ticket.
    // The person who made it is not told about their own action.
    const isStaffUser = role === 'admin' || role === 'guard';
    const notMine = (r) => !r.created_by_id || String(r.created_by_id) !== String(user.id);
    const who = (r) => `${r.resident_name || 'A resident'}${r.flat_number ? ` (Flat ${r.flat_number})` : ''}`;
    const extraUnsubs = [];
    const watchNew = (entityName, allowed, build) => {
      if (!allowed) return;
      extraUnsubs.push(
        wgate.entities[entityName].subscribe((event) => {
          if (event.type !== 'create' || !event.data || !notMine(event.data)) return;
          const n = build(event.data);
          addNotification(n);
          toast.info(n.message, { duration: 6000 });
        })
      );
    };
 watchNew('AmenityBooking', isStaffUser, (r) => ({
      title: 'New Amenity Booking', type: 'amenity',
      message: `🏊 ${who(r)} asked for the ${r.amenity} on ${r.booking_date}, ${r.start_time}–${r.end_time}`,
    }));
    watchNew('PreApproval', isStaffUser, (r) => ({
      title: 'New Pre-approval', type: 'preapproval',
      message: `✅ ${who(r)} pre-approved ${r.visitor_name} (${r.category})`,
    }));
    watchNew('GatePass', isStaffUser, (r) => ({
      title: 'New Gate Pass', type: 'gatepass',
      message: `🎫 ${who(r)} made a gate pass for ${r.visitor_name} ${r.valid_until && r.valid_until !== r.valid_date ? `from ${r.valid_date} to ${r.valid_until}` : `on ${r.valid_date}`}`,
    }));
    watchNew('ServiceTicket', isStaffUser, (r) => ({
      title: 'New Service Ticket', type: 'ticket',
      message: `🔧 ${who(r)}: ${r.title || 'New request'}`,
    }));

    // A new notice was posted: tapping it in the bell opens the notice itself.
    watchNew('Notice', true, (r) => ({
      title: 'New Notice', type: 'notice', link: `/NoticeBoard?open=${r.id}`,
      message: `📢 ${r.title || 'A new notice was posted'}`,
    }));

    // The admin approved or rejected a booking I asked for.
    if (isResident) {
      const shown = {}; // booking id -> the decision already shown, so the same one never appears twice
      extraUnsubs.push(
        wgate.entities.AmenityBooking.subscribe((event) => {
          if (event.type !== 'update' || !event.data) return;
          const b = event.data;
          const mine = user.email && b.resident_email && String(b.resident_email).toLowerCase() === String(user.email).toLowerCase();
          if (!mine || !['confirmed', 'rejected'].includes(b.status) || shown[b.id] === b.status) return;
          shown[b.id] = b.status;
          const approved = b.status === 'confirmed';
          const msg = `${approved ? '✅' : '❌'} Your ${b.amenity} booking on ${b.booking_date}, ${b.start_time}–${b.end_time} was ${approved ? 'approved' : 'rejected'}`;
          addNotification({ title: approved ? 'Booking Approved' : 'Booking Rejected', message: msg, type: 'amenity' });
          toast[approved ? 'success' : 'error'](msg, { duration: 6000 });
        })
      );
    }

    return () => {
      unsubVisitor();
      unsubTicket();
      unsubVisitorUpdate();
      extraUnsubs.forEach((unsub) => unsub());
    };
  }, [user]);
  // Keep every open screen's data fresh in real time — whenever anything
  // changes anywhere (another resident's phone, the gate, another tab),
  // invalidate React Query's cache so the active screen refetches on its
  // own. No pull-to-refresh or manual reload needed.
  useEffect(() => {
       if (!user || user.role === 'superadmin' || user.dues_blocked) return;
    let pending = null;
    const scheduleRefresh = () => {
      if (pending) return;
      // Small debounce so a burst of events (e.g. a bulk check-in) only
      // triggers one refetch instead of one per event.
      pending = setTimeout(() => {
        pending = null;
        queryClient.invalidateQueries();
      }, 300);
    };
    const unsubscribers = ENTITY_NAMES.map((name) => wgate.entities[name].subscribe(scheduleRefresh));
    return () => {
      unsubscribers.forEach((unsub) => unsub());
      if (pending) clearTimeout(pending);
    };
  }, [user, queryClient]);
  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
