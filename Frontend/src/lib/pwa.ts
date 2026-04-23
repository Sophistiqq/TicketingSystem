import { client } from "./api";

// ============================================================
// PWA & Notification Helpers
// ============================================================

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.error('This browser does not support notifications.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export async function getPushSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return await registration.pushManager.getSubscription();
}

export async function subscribeToPush(publicVapidKey: string) {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicVapidKey
    });

    // Send subscription to backend
    const subJson = subscription.toJSON();
    if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
      await client.notifications.subscribe.post({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth
        }
      });
    }

    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return null;
  }
}

export function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         (window.navigator as any).standalone || 
         document.referrer.includes('android-app://');
}

/**
 * Initialize push notifications for the current user
 */
export async function initPushNotifications() {
  const publicKey = "BF3n0f70gp_oanDDWJYHIxUV-XkaDFfKHj9PeZ9Xl_w-6MzSvnjYfeW94zBT6ywhgQvKtf4aTvY6QU3s72rWRGs";
  
  const hasPermission = await requestNotificationPermission();
  if (hasPermission) {
    await subscribeToPush(publicKey);
  }
}
