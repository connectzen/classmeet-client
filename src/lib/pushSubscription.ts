const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Fetch the VAPID public key from the server and convert it to a Uint8Array
async function getVapidPublicKey(): Promise<ArrayBuffer | null> {
    try {
        const res = await fetch(`${SERVER_URL}/api/push/vapid-public-key`);
        const { publicKey } = await res.json();
        if (!publicKey) return null;
        return urlBase64ToUint8Array(publicKey);
    } catch {
        return null;
    }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const arr = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
    return arr.buffer;
}

/**
 * Subscribe this browser to web push and save the subscription to the server.
 * Call this after the user grants notification permission.
 * @param userId  If provided, the subscription is associated with this user.
 */
export async function subscribeToPush(userId?: string): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;

    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKey,
        });
    }

    // Persist the subscription on the server
    await fetch(`${SERVER_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: userId || 'anonymous',
            subscription: subscription.toJSON(),
        }),
    });
}

/**
 * Re-subscribe (or update stored subscription) for a newly logged-in user.
 * Call this after sign-in if notification permission is already granted.
 */
export async function resubscribeForUser(userId: string): Promise<void> {
    if (Notification.permission !== 'granted') return;
    await subscribeToPush(userId);
}
