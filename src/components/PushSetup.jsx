import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';

let listenersAdded = false;

// Asks for notification permission after sign-in and gives this phone's token to the server.
// Only does anything inside the installed Android app.
export default function PushSetup() {
  const { user } = useAuth();
  const uid = user?.id;
  const role = user?.role;

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !uid || role === 'superadmin') return;
    (async () => {
      try {
        if (!listenersAdded) {
          listenersAdded = true;
          await PushNotifications.addListener('registration', (t) => {
            wgate.push.register(t.value).catch(() => {});
          });
          await PushNotifications.addListener('registrationError', (e) => {
            console.warn('Push registration failed', e);
          });
          // Tapping a notification opens the page named in it (for example the Visitors page).
          await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
            const url = a?.notification?.data?.url;
            if (url) window.location.hash = '#' + url;
          });
        }
        await PushNotifications.createChannel({
          id: 'visitors',
          name: 'Visitor at the gate',
          description: 'Alerts when a visitor is waiting for approval',
          importance: 5,
          visibility: 1,
          vibration: true,
        });
                await PushNotifications.createChannel({
          id: 'emergency',
          name: 'Emergency alerts',
          description: 'Alerts when a resident presses the emergency button',
          importance: 5,
          visibility: 1,
          vibration: true,
        });
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') return;
        await PushNotifications.register();
      } catch (err) {
        console.warn('Push setup skipped', err);
      }
    })();
  }, [uid, role]);

  return null;
}