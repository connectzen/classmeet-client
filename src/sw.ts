/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { skipWaiting, clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Activate the new SW immediately when it installs — don't wait for all
// existing tabs to close first. This ensures deployed code changes are
// picked up on the next page navigation without a hard refresh.
skipWaiting();
clientsClaim();

// ── Precaching ────────────────────────────────────────────────────────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ── Runtime caching ───────────────────────────────────────────────────────────

// API: always network (live classroom data must be fresh)
registerRoute(
    ({ url }) => url.pathname.startsWith('/api/'),
    new NetworkOnly()
);

// Google Fonts stylesheets
registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com',
    new CacheFirst({
        cacheName: 'google-fonts-stylesheets',
        plugins: [
            new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
    })
);

// Google Fonts webfonts
registerRoute(
    ({ url }) => url.origin === 'https://fonts.gstatic.com',
    new CacheFirst({
        cacheName: 'google-fonts-webfonts',
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
    })
);

// ── Push Notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {};
    const title: string = data.title || 'ClassMeet';
    const options: NotificationOptions = {
        body: data.body || '',
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        tag: data.tag,
        data: { url: data.url || '/' },
        requireInteraction: false,
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url: string = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Focus existing open window if available
                for (const client of clientList) {
                    if ('focus' in client) return (client as WindowClient).focus();
                }
                return self.clients.openWindow(url);
            })
    );
});
