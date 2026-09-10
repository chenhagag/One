/**
 * Push notification registration + lifecycle for Capacitor Android app.
 *
 * Flow:
 * 1. On login: initPushNotifications() → check/request permission → register → send token to backend
 * 2. On app resume: syncPushPermission() → check current permission status → update backend
 * 3. On logout: unregisterPush() → remove token from backend
 *
 * Only runs inside native Capacitor shell — no-op on web/PWA.
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiFetch } from './api';

const FCM_TOKEN_KEY = 'one_fcm_token';

/** Check if push notifications are available (native app only) */
function isPushAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');
}

/**
 * Initialize push notifications — call after successful login/auth sync.
 * Requests permission, registers with FCM, and sends token to backend.
 */
export async function initPushNotifications(): Promise<void> {
  if (!isPushAvailable()) {
    console.log('[push] Not in native app — skipping');
    return;
  }

  try {
    // Check current permission status
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      // First time — ask user
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.log('[push] Permission not granted:', permStatus.receive);
      // Sync denied status to backend
      await syncPermissionToBackend('denied');
      return;
    }

    // Register with FCM
    await PushNotifications.register();

    // Listen for registration token
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[push] FCM token received');

      // Save locally for logout cleanup
      try {
        localStorage.setItem(FCM_TOKEN_KEY, token.value);
      } catch {}

      // Send to backend
      try {
        await apiFetch('/push/register', {
          method: 'POST',
          body: JSON.stringify({
            token: token.value,
            platform: Capacitor.getPlatform(),
            permission_status: 'granted',
          }),
        });
        console.log('[push] Token registered with backend');
      } catch (err) {
        console.error('[push] Failed to register token with backend:', err);
      }
    });

    // Handle registration error
    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] Registration error:', err);
    });

    // Handle notification received while app is in foreground
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[push] Notification received (foreground):', notification.title);
      // Dispatch event for App.tsx to show in-app notification
      window.dispatchEvent(new CustomEvent('push-notification', {
        detail: {
          title: notification.title,
          body: notification.body,
          data: notification.data,
        },
      }));
    });

    // Handle notification tap (app was in background)
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[push] Notification tapped:', action.notification.data);
      // Dispatch event for App.tsx to handle navigation
      window.dispatchEvent(new CustomEvent('push-navigate', {
        detail: action.notification.data,
      }));
    });

  } catch (err) {
    console.error('[push] Init failed:', err);
  }
}

/**
 * Sync push permission status with backend — call on app resume.
 * Detects if user revoked notification permission in Android settings.
 */
export async function syncPushPermission(): Promise<void> {
  if (!isPushAvailable()) return;

  try {
    const permStatus = await PushNotifications.checkPermissions();
    await syncPermissionToBackend(permStatus.receive);
  } catch (err) {
    console.error('[push] Permission sync failed:', err);
  }
}

/**
 * Unregister push token — call on logout.
 */
export async function unregisterPush(): Promise<void> {
  if (!isPushAvailable()) return;

  try {
    const savedToken = localStorage.getItem(FCM_TOKEN_KEY);
    if (savedToken) {
      await apiFetch('/push/unregister', {
        method: 'POST',
        body: JSON.stringify({ token: savedToken }),
      });
      localStorage.removeItem(FCM_TOKEN_KEY);
      console.log('[push] Token unregistered');
    }
  } catch (err) {
    console.error('[push] Unregister failed:', err);
  }

  try {
    await PushNotifications.removeAllListeners();
  } catch {}
}

/** Helper: send permission status to backend */
async function syncPermissionToBackend(status: string): Promise<void> {
  try {
    await apiFetch('/push/sync-permission', {
      method: 'POST',
      body: JSON.stringify({ permission_status: status }),
    });
  } catch (err) {
    console.error('[push] Permission sync to backend failed:', err);
  }
}
