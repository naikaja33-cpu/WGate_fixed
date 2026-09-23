import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
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

  const addNotification = (notif) => {
    setNotifications(prev => [{ id: Date.now(), read: false, time: new Date(), ...notif }, ...prev].slice(0, 50));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!user) return;
    const role = user.role || 'tenant';
    const isResident = role === 'tenant' || role === 'owner';

    // Visitor subscription — notify resident when a visitor checks in for their flat
    const unsubVisitor = base44.entities.Visitor.subscribe((event) => {
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
    const unsubTicket = base44.entities.ServiceTicket.subscribe((event) => {
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
    const unsubVisitorUpdate = base44.entities.Visitor.subscribe((event) => {
      if (event.type !== 'update') return;
      const v = event.data;
      if (!v.status || v.status === 'pending') return;

      const isMyFlat = isResident && user.flat_number && v.flat_number === user.flat_number;
      if (isMyFlat) {
        const emoji = v.status === 'approved' ? '✅' : '❌';
        const msg = `${emoji} Visitor ${v.visitor_name} was ${v.status}`;
        addNotification({ title: 'Visitor Update', message: msg, type: 'visitor' });
        toast[v.status === 'approved' ? 'success' : 'error'](msg, { duration: 5000 });
      }
    });

    return () => {
      unsubVisitor();
      unsubTicket();
      unsubVisitorUpdate();
    };
  }, [user]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
