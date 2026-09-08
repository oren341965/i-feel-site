/* I Feel tenant handover offline worker. */
'use strict';

const CACHE_NAME = 'ifeel-tenant-handovers-v1';
const DB_NAME = 'ifeel-staff-offline-v1';
const DB_VERSION = 1;
const QUEUE_STORE = 'handoverQueue';
const LAST_HANDOVER_URL = '/staff-expenses/__offline-last-handover';
const MAX_DOCUMENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HANDOVER_DOCUMENTS = 150;
const STATIC_ASSETS = [
    '/staff-expenses/portal.css',
    '/staff-expenses/portal.js',
    '/assets/ifeel-logo.png',
    '/assets/favicon.png',
];
let activeSync = null;

const openDatabase = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(QUEUE_STORE)) {
            database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open the offline queue.'));
});

const queueEntries = async () => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(QUEUE_STORE, 'readonly');
        const request = transaction.objectStore(QUEUE_STORE).getAll();
        request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt - b.createdAt));
        request.onerror = () => reject(request.error || new Error('Unable to read the offline queue.'));
        transaction.oncomplete = () => database.close();
    });
};

const deleteQueueEntry = async (id) => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(QUEUE_STORE, 'readwrite');
        transaction.objectStore(QUEUE_STORE).delete(id);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => reject(transaction.error || new Error('Unable to update the offline queue.'));
    });
};

const clearOfflineData = async () => {
    await caches.delete(CACHE_NAME);
    await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
};

const notifyClients = async (message) => {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    clients.forEach((client) => client.postMessage(message));
};

const cacheHandoverDocument = async (url, html) => {
    if (typeof html !== 'string' || !html.includes('data-handover-selector')) return;
    const target = new URL(url, self.location.origin);
    if (target.origin !== self.location.origin || target.pathname !== '/staff-expenses/') return;

    const headers = new Headers({
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'no-store, private, max-age=0',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
        'X-Ifeel-Offline-Cached-At': String(Date.now()),
        'X-Ifeel-Offline-Cache': 'handover',
    });
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(html, { status: 200, headers });
    await cache.put(target.href, response.clone());
    if (html.includes('data-handover-form')) await cache.put(LAST_HANDOVER_URL, response.clone());

    const handoverEntries = [];
    for (const request of await cache.keys()) {
        const requestUrl = new URL(request.url);
        if (requestUrl.pathname !== '/staff-expenses/' || !requestUrl.searchParams.has('handover_resident')) continue;
        const cached = await cache.match(request);
        handoverEntries.push({
            request,
            cachedAt: Number(cached?.headers.get('X-Ifeel-Offline-Cached-At') || 0),
        });
    }
    handoverEntries.sort((a, b) => b.cachedAt - a.cachedAt);
    await Promise.all(handoverEntries.slice(MAX_HANDOVER_DOCUMENTS).map((entry) => cache.delete(entry.request)));
};

const validCachedDocument = async (request) => {
    const cache = await caches.open(CACHE_NAME);
    let matchedRequest = request;
    let response = await cache.match(request);
    if (!response) {
        const requestedUrl = new URL(request.url);
        const projectId = requestedUrl.searchParams.get('handover_project');
        const residentId = requestedUrl.searchParams.get('handover_resident');
        if (projectId && residentId) {
            for (const cachedRequest of await cache.keys()) {
                const cachedUrl = new URL(cachedRequest.url);
                if (
                    cachedUrl.pathname === '/staff-expenses/'
                    && cachedUrl.searchParams.get('handover_project') === projectId
                    && cachedUrl.searchParams.get('handover_resident') === residentId
                ) {
                    response = await cache.match(cachedRequest);
                    if (response) {
                        matchedRequest = cachedRequest;
                        break;
                    }
                }
            }
        }
    }
    if (!response) {
        response = await cache.match(LAST_HANDOVER_URL);
        matchedRequest = LAST_HANDOVER_URL;
    }
    if (!response) return null;
    const cachedAt = Number(response.headers.get('X-Ifeel-Offline-Cached-At') || 0);
    if (!cachedAt || Date.now() - cachedAt > MAX_DOCUMENT_AGE_MS) {
        await cache.delete(matchedRequest);
        await cache.delete(LAST_HANDOVER_URL);
        return null;
    }
    return response;
};

const validExactCachedDocument = async (request) => {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(request);
    if (!response) return null;
    const cachedAt = Number(response.headers.get('X-Ifeel-Offline-Cached-At') || 0);
    if (!cachedAt || Date.now() - cachedAt > MAX_DOCUMENT_AGE_MS) {
        await cache.delete(request);
        return null;
    }
    return response;
};

const replaceField = (fields, name, value) => {
    const filtered = fields.filter((field) => field.name !== name);
    filtered.push({ name, value });
    return filtered;
};

const extractInputValue = (html, name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byNameFirst = new RegExp(`<input[^>]*name=["']${escaped}["'][^>]*value=["']([^"']*)["']`, 'i').exec(html);
    if (byNameFirst) return byNameFirst[1];
    const byValueFirst = new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${escaped}["']`, 'i').exec(html);
    return byValueFirst ? byValueFirst[1] : '';
};

const refreshSecurityFields = async (entry) => {
    const refreshUrl = new URL('/staff-expenses/', self.location.origin);
    refreshUrl.searchParams.set('tab', 'handovers');
    refreshUrl.searchParams.set('handover_project', entry.projectId);
    refreshUrl.searchParams.set('handover_resident', entry.residentId);
    if (entry.building) refreshUrl.searchParams.set('handover_building', entry.building);

    const response = await fetch(refreshUrl.href, {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'X-Ifeel-Offline-Refresh': '1' },
    });
    if (!response.ok) throw new Error('refresh-failed');
    const html = await response.text();
    const csrf = extractInputValue(html, 'csrf');
    const submissionToken = extractInputValue(html, 'handover_submission_token');
    if (!html.includes('data-handover-form') || !csrf || !submissionToken) {
        const error = new Error('authentication-required');
        error.code = 'authentication-required';
        throw error;
    }
    entry.fields = replaceField(entry.fields, 'csrf', csrf);
    entry.fields = replaceField(entry.fields, 'handover_submission_token', submissionToken);
};

const entryFormData = (entry) => {
    const formData = new FormData();
    entry.fields.forEach((field) => formData.append(field.name, field.value));
    entry.files.forEach((file) => {
        formData.append(file.name, file.blob, file.fileName || 'handover-photo.jpg');
    });
    return formData;
};

const syncQueue = async () => {
    const entries = await queueEntries();
    await notifyClients({ type: 'HANDOVER_QUEUE_STATUS', pending: entries.length, syncing: entries.length > 0 });
    for (const entry of entries) {
        try {
            await refreshSecurityFields(entry);
            const response = await fetch(entry.url, {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                redirect: 'follow',
                headers: {
                    'Accept': 'application/json',
                    'X-Ifeel-Offline-Queue': '1',
                },
                body: entryFormData(entry),
            });
            const contentType = response.headers.get('Content-Type') || '';
            if (!contentType.includes('application/json')) {
                const error = new Error('authentication-required');
                error.code = 'authentication-required';
                throw error;
            }
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.error || 'sync-failed');
            await deleteQueueEntry(entry.id);
            await notifyClients({
                type: 'HANDOVER_SYNC_SUCCESS',
                queueId: entry.id,
                handoverId: result.handoverId || '',
                notificationsSent: result.notificationsSent !== false,
            });
        } catch (error) {
            const authRequired = error?.code === 'authentication-required' || error?.message === 'authentication-required';
            await notifyClients({
                type: authRequired ? 'HANDOVER_SYNC_AUTH_REQUIRED' : 'HANDOVER_SYNC_ERROR',
                queueId: entry.id,
                message: authRequired ? '' : String(error?.message || ''),
            });
            throw error;
        }
    }
    await notifyClients({ type: 'HANDOVER_QUEUE_STATUS', pending: 0, syncing: false });
};

const requestQueueSync = () => {
    if (!activeSync) {
        activeSync = syncQueue().finally(() => {
            activeSync = null;
        });
    }
    return activeSync;
};

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(Promise.all([
        self.clients.claim(),
        caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('ifeel-tenant-handovers-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    ]));
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'CACHE_HANDOVER_PAGE') {
        event.waitUntil(cacheHandoverDocument(event.data.url, event.data.html).then(() => {
            event.ports?.[0]?.postMessage({ ok: true });
        }).catch(() => {
            event.ports?.[0]?.postMessage({ ok: false });
        }));
    }
    if (event.data?.type === 'SYNC_HANDOVER_QUEUE') {
        event.waitUntil(requestQueueSync().catch(() => undefined));
    }
    if (event.data?.type === 'CLEAR_OFFLINE_HANDOVERS') {
        event.waitUntil(clearOfflineData());
    }
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'tenant-handover-sync') event.waitUntil(requestQueueSync());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate' && url.pathname === '/staff-expenses/') {
        event.respondWith((async () => {
            const canOpenImmediately = url.searchParams.get('tab') === 'handovers' && url.searchParams.has('handover_resident');
            const exactCached = canOpenImmediately ? await validExactCachedDocument(request) : null;
            if (exactCached && self.navigator.onLine === false) return exactCached;
            try {
                const response = await fetch(request);
                if (response.ok && response.headers.get('X-Ifeel-Offline-Cache') === 'handover') {
                    const html = await response.clone().text();
                    await cacheHandoverDocument(request.url, html);
                }
                return response;
            } catch (error) {
                if (url.searchParams.get('tab') !== 'handovers') throw error;
                const cached = await validCachedDocument(request);
                if (cached) return cached;
                throw error;
            }
        })());
        return;
    }

    if (STATIC_ASSETS.some((asset) => url.pathname === asset)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request, { ignoreSearch: true });
            if (cached) return cached;
            const response = await fetch(request);
            if (response.ok) await cache.put(request, response.clone());
            return response;
        })());
    }
});
