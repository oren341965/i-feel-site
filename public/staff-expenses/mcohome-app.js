(function () {
    'use strict';

    const DB_NAME = 'ifeel-mcohome-offline';
    const DB_VERSION = 1;
    const STORE = 'queue';
    const API_URL = 'mcohome-submit.php';
    const SW_URL = 'mcohome-sw.js';
    const MANIFEST_URL = 'mcohome-manifest.webmanifest';
    const MAX_VIDEO_SECONDS = 75;
    const MAX_FILE_BYTES = 180 * 1024 * 1024;
    let deferredInstallPrompt = null;

    function $(id) { return document.getElementById(id); }
    function form() { return $('mcohome-fault-form'); }
    function statusBox() { return $('mcohome-app-status'); }

    function setStatus(message, kind) {
        const box = statusBox();
        if (!box) return;
        box.hidden = false;
        box.className = 'alert alert--' + (kind || 'info');
        box.textContent = message;
    }

    function eventId() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const date = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
        const time = pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
        const bytes = new Uint8Array(3);
        if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
        else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        const suffix = Array.from(bytes).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
        return 'MCO-' + date + '-' + time + '-' + suffix;
    }

    function ensureClientEventId(targetForm) {
        let input = targetForm.querySelector('input[name="client_event_id"]');
        if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'client_event_id';
            targetForm.appendChild(input);
        }
        if (!/^MCO-\d{8}-\d{6}-[A-F0-9]{6}$/.test(input.value || '')) input.value = eventId();
        return input.value;
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'eventId' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB failed'));
        });
    }

    async function queuePut(item) {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(item);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    async function queueDelete(id) {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    async function queueAll() {
        const db = await openDb();
        const items = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return items;
    }

    async function updateQueueCount() {
        try {
            const items = await queueAll();
            const el = $('mcohome-queue-count');
            if (el) el.textContent = String(items.length);
            return items.length;
        } catch (_) {
            return 0;
        }
    }

    function serializeForm(targetForm) {
        const fd = new FormData(targetForm);
        const fields = {};
        const files = [];
        for (const [key, value] of fd.entries()) {
            if (value instanceof File) {
                if (value.size > 0) files.push({ key, blob: value, name: value.name, type: value.type, lastModified: value.lastModified });
            } else if (Object.prototype.hasOwnProperty.call(fields, key)) {
                if (!Array.isArray(fields[key])) fields[key] = [fields[key]];
                fields[key].push(String(value));
            } else {
                fields[key] = String(value);
            }
        }
        return { eventId: fields.client_event_id, createdAt: Date.now(), fields, files };
    }

    function deserializeForm(item) {
        const fd = new FormData();
        Object.keys(item.fields || {}).forEach(key => {
            const value = item.fields[key];
            if (Array.isArray(value)) value.forEach(v => fd.append(key, v));
            else fd.append(key, value);
        });
        (item.files || []).forEach(file => {
            const blob = file.blob instanceof Blob ? file.blob : new Blob([file.blob], { type: file.type || 'application/octet-stream' });
            fd.append(file.key || 'media[]', blob, file.name || 'media');
        });
        return fd;
    }

    function fileDuration(file) {
        return new Promise(resolve => {
            if (!file.type || file.type.indexOf('video/') !== 0) return resolve(0);
            const video = document.createElement('video');
            const url = URL.createObjectURL(file);
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                const duration = Number(video.duration || 0);
                URL.revokeObjectURL(url);
                resolve(duration);
            };
            video.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(0);
            };
            video.src = url;
        });
    }

    async function validateFiles(targetForm) {
        const input = targetForm.querySelector('input[type="file"][name="media[]"]');
        if (!input || !input.files) return true;
        for (const file of input.files) {
            if (file.size > MAX_FILE_BYTES) {
                setStatus('הקובץ גדול מדי. ניתן לצרף עד 180MB לקובץ.', 'error');
                return false;
            }
            const duration = await fileDuration(file);
            if (duration > MAX_VIDEO_SECONDS) {
                setStatus('הסרטון ארוך מדקה. יש לצלם הסבר של עד דקה.', 'error');
                return false;
            }
        }
        return true;
    }

    async function sendItem(item) {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: deserializeForm(item),
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-I-Feel-MCOHome-App': '1'
            }
        });
        if (response.status === 401 || response.status === 403) {
            const error = new Error('AUTH_REQUIRED');
            error.authRequired = true;
            throw error;
        }
        let payload = null;
        try { payload = await response.json(); } catch (_) {}
        if (!response.ok || !payload || !payload.ok) {
            throw new Error(payload && payload.error ? payload.error : 'SUBMIT_FAILED');
        }
        return payload;
    }

    async function syncQueue() {
        if (!navigator.onLine) return;
        let items;
        try { items = await queueAll(); } catch (_) { return; }
        for (const item of items) {
            try {
                const payload = await sendItem(item);
                await queueDelete(item.eventId);
                const repeat = payload.recurring ? ' התקלה זוהתה כחוזרת ונפתחה בחומרה ' + (payload.severity || 'HIGH') + '.' : '';
                setStatus('התקלה ' + payload.eventId + ' נשלחה ונשמרה.' + repeat, payload.recurring ? 'error' : 'success');
            } catch (error) {
                if (error && error.authRequired) {
                    setStatus('יש דיווחים שמורים במכשיר. התחבר לאזור העובדים כשיש אינטרנט והם יישלחו אוטומטית.', 'info');
                    break;
                }
                break;
            }
        }
        await updateQueueCount();
    }

    async function onSubmit(event) {
        event.preventDefault();
        const targetForm = event.currentTarget;
        const submit = $('mcohome-submit');
        if (submit) { submit.disabled = true; submit.textContent = 'שומר...'; }
        try {
            if (!(await validateFiles(targetForm))) return;
            ensureClientEventId(targetForm);
            const item = serializeForm(targetForm);
            if (!navigator.onLine) {
                await queuePut(item);
                setStatus('אין אינטרנט. התקלה נשמרה באפליקציה ותישלח אוטומטית כשהחיבור יחזור.', 'success');
                await updateQueueCount();
                targetForm.reset();
                ensureClientEventId(targetForm);
                return;
            }
            try {
                const payload = await sendItem(item);
                const recurringText = payload.recurring ? ' זוהתה תקלה חוזרת. החומרה: ' + (payload.severity || 'HIGH') + '.' : '';
                setStatus('הדיווח נשמר במספר ' + payload.eventId + ' ונשלח למעקב.' + recurringText, payload.recurring ? 'error' : 'success');
                targetForm.reset();
                ensureClientEventId(targetForm);
            } catch (error) {
                await queuePut(item);
                if (error && error.authRequired) {
                    setStatus('הדיווח נשמר במכשיר. יש להתחבר מחדש כשיש אינטרנט, ואז הוא יישלח אוטומטית.', 'info');
                } else {
                    setStatus('לא ניתן להגיע לשרת. הדיווח נשמר במכשיר ויישלח אוטומטית בהמשך.', 'success');
                }
                await updateQueueCount();
            }
        } finally {
            if (submit) { submit.disabled = false; submit.textContent = 'שמירת ושליחת התקלה'; }
        }
    }

    function initFormBehavior() {
        const targetForm = form();
        if (!targetForm) return;
        ensureClientEventId(targetForm);
        const nineWrap = $('mcohome-nine-wrap');
        const nine = $('mcohome-nine-config');
        const inrush = $('mcohome-inrush');
        const media = $('mcohome-media');
        const mediaList = $('mcohome-media-list');
        function selected(name) {
            const el = targetForm.querySelector('input[name="' + name + '"]:checked');
            return el ? el.value : '';
        }
        function sync() {
            if (nineWrap && nine) {
                const isNine = selected('device_type') === 'מפסק 9';
                nineWrap.style.display = isNine ? 'block' : 'none';
                nine.required = isNine;
                if (!isNine) nine.value = '';
            }
            if (inrush && selected('fault_type') === 'ממסר נדבק') inrush.checked = true;
        }
        targetForm.addEventListener('change', sync);
        targetForm.addEventListener('submit', onSubmit);
        sync();
        if (media) media.addEventListener('change', function () {
            let total = 0;
            const names = [];
            for (const file of media.files) {
                total += file.size;
                names.push(file.name + ' (' + Math.round(file.size / 1024 / 1024 * 10) / 10 + 'MB)');
            }
            if (mediaList) mediaList.textContent = names.length ? names.join(' | ') + ' | סהכ ' + Math.round(total / 1024 / 1024 * 10) / 10 + 'MB' : '';
        });
    }

    function installPwa() {
        if (!document.querySelector('link[rel="manifest"]')) {
            const link = document.createElement('link');
            link.rel = 'manifest';
            link.href = MANIFEST_URL;
            document.head.appendChild(link);
        }
        const apple = document.createElement('meta');
        apple.name = 'apple-mobile-web-app-capable';
        apple.content = 'yes';
        document.head.appendChild(apple);
        if ('serviceWorker' in navigator) navigator.serviceWorker.register(SW_URL).catch(function () {});
        window.addEventListener('beforeinstallprompt', function (event) {
            event.preventDefault();
            deferredInstallPrompt = event;
            const button = $('mcohome-install');
            if (button) button.hidden = false;
        });
        const button = $('mcohome-install');
        if (button) button.addEventListener('click', async function () {
            if (!deferredInstallPrompt) {
                setStatus('באייפון: Share ואז Add to Home Screen. באנדרואיד: תפריט הדפדפן ואז Install app.', 'info');
                return;
            }
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            button.hidden = true;
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initFormBehavior();
        installPwa();
        updateQueueCount();
        syncQueue();
        window.addEventListener('online', syncQueue);
    });
})();
