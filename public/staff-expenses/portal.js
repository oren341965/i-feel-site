(() => {
    'use strict';

    const offlineDatabaseName = 'ifeel-staff-offline-v1';
    const offlineDatabaseVersion = 1;
    const handoverQueueStore = 'handoverQueue';
    const offlineSupported = 'serviceWorker' in navigator && 'indexedDB' in window;
    const offlineStatus = document.querySelector('[data-handover-offline-status]');
    const offlineTitle = offlineStatus?.querySelector('[data-handover-offline-title]');
    const offlineMessage = offlineStatus?.querySelector('[data-handover-offline-message]');
    const offlineQueueBadge = offlineStatus?.querySelector('[data-handover-offline-queue]');
    let offlineRegistration = null;
    let activeHandoverQueueId = '';

    const openOfflineDatabase = () => new Promise((resolve, reject) => {
        const request = indexedDB.open(offlineDatabaseName, offlineDatabaseVersion);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(handoverQueueStore)) {
                database.createObjectStore(handoverQueueStore, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('לא ניתן לפתוח את האחסון המקומי.'));
    });

    const saveOfflineHandover = async (entry) => {
        const database = await openOfflineDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(handoverQueueStore, 'readwrite');
            transaction.objectStore(handoverQueueStore).put(entry);
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
            transaction.onerror = () => reject(transaction.error || new Error('לא ניתן לשמור את המסירה במכשיר.'));
        });
    };

    const offlineQueueCount = async () => {
        if (!offlineSupported) return 0;
        const database = await openOfflineDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(handoverQueueStore, 'readonly');
            const request = transaction.objectStore(handoverQueueStore).count();
            request.onsuccess = () => resolve(request.result || 0);
            request.onerror = () => reject(request.error || new Error('לא ניתן לקרוא את תור המסירות.'));
            transaction.oncomplete = () => database.close();
        });
    };

    const setOfflineStatus = (state, title, message) => {
        if (!offlineStatus) return;
        offlineStatus.classList.remove('is-online', 'is-offline', 'is-ready', 'is-error', 'is-syncing');
        if (state) offlineStatus.classList.add(state);
        if (offlineTitle) offlineTitle.textContent = title;
        if (offlineMessage) offlineMessage.textContent = message;
    };

    const refreshOfflineQueueBadge = async (providedCount = null) => {
        if (!offlineQueueBadge) return;
        const count = providedCount === null ? await offlineQueueCount() : providedCount;
        offlineQueueBadge.hidden = count < 1;
        offlineQueueBadge.textContent = count === 1 ? 'מסירה אחת ממתינה לסנכרון' : `${count} מסירות ממתינות לסנכרון`;
    };

    const handoverFormEntry = (form) => {
        const formData = new FormData(form);
        const fields = [];
        const files = [];
        formData.forEach((value, name) => {
            if (value instanceof File) {
                if (value.size > 0) {
                    files.push({
                        name,
                        blob: value,
                        fileName: value.name,
                        type: value.type,
                        lastModified: value.lastModified,
                    });
                }
                return;
            }
            fields.push({ name, value: String(value) });
        });
        const valueFor = (name) => fields.find((field) => field.name === name)?.value || '';
        const currentUrl = new URL(window.location.href);
        const submitUrl = new URL(form.getAttribute('action') || currentUrl.href, currentUrl.href);
        return {
            id: valueFor('handover_client_id'),
            createdAt: Date.now(),
            url: submitUrl.href,
            pageUrl: currentUrl.href,
            projectId: valueFor('handover_project_id'),
            residentId: valueFor('handover_resident_id'),
            building: currentUrl.searchParams.get('handover_building') || '',
            fields,
            files,
        };
    };

    const requestHandoverSync = async () => {
        if (!offlineRegistration || !navigator.onLine) return;
        try {
            if ('sync' in offlineRegistration) {
                await offlineRegistration.sync.register('tenant-handover-sync');
            }
        } catch (error) {
            // The active page also asks the worker to sync, so Background Sync
            // registration is an optional enhancement rather than a blocker.
        }
        (offlineRegistration.active || offlineRegistration.waiting)?.postMessage({ type: 'SYNC_HANDOVER_QUEUE' });
    };

    const storeHandoverPageOffline = (url, html) => new Promise((resolve, reject) => {
        const worker = offlineRegistration?.active || offlineRegistration?.waiting;
        if (!worker) {
            reject(new Error('offline-worker-unavailable'));
            return;
        }
        const channel = new MessageChannel();
        const timeout = window.setTimeout(() => reject(new Error('offline-cache-timeout')), 15000);
        channel.port1.onmessage = (event) => {
            window.clearTimeout(timeout);
            if (event.data?.ok) resolve();
            else reject(new Error('offline-cache-failed'));
        };
        worker.postMessage({ type: 'CACHE_HANDOVER_PAGE', url, html }, [channel.port2]);
    });

    const cacheCurrentHandoverPage = () => {
        const form = document.querySelector('[data-handover-form]');
        if (!form) return;
        storeHandoverPageOffline(
            window.location.href,
            `<!doctype html>\n${document.documentElement.outerHTML}`
        ).catch(() => undefined);
        setOfflineStatus(
            navigator.onLine ? 'is-ready' : 'is-offline',
            navigator.onLine ? 'הטופס מוכן לעבודה ללא קליטה' : 'עובדים כעת ללא קליטה',
            navigator.onLine
                ? 'אפשר להמשיך גם אם החיבור ייעלם. הטופס והתמונות יישמרו במכשיר עד לסנכרון.'
                : 'מלאו כרגיל. בסיום המסירה תישמר במכשיר ותישלח אוטומטית לאחר חזרת האינטרנט.'
        );
    };

    const updateConnectionStatus = async () => {
        const hasForm = Boolean(document.querySelector('[data-handover-form]'));
        const pending = await offlineQueueCount().catch(() => 0);
        await refreshOfflineQueueBadge(pending).catch(() => undefined);
        if (!offlineSupported) {
            setOfflineStatus('is-error', 'מצב ללא קליטה אינו נתמך בדפדפן זה', 'יש לפתוח את אזור העובדים ב-Chrome, Edge או Safari מעודכן.');
            return;
        }
        if (!navigator.onLine) {
            setOfflineStatus(
                'is-offline',
                hasForm ? 'עובדים כעת ללא קליטה' : 'אין חיבור — לא נמצא טופס דייר שמור',
                hasForm
                    ? 'מלאו כרגיל. בסיום המסירה תישמר במכשיר ותישלח אוטומטית לאחר חזרת האינטרנט.'
                    : 'יש לפתוח טופס דייר אחד בזמן חיבור לפני כניסה לאזור ללא קליטה.'
            );
            return;
        }
        if (pending > 0) {
            setOfflineStatus('is-syncing', 'החיבור חזר — מסנכרן מסירות', 'אין לסגור את העמוד עד לסיום הסנכרון.');
            return;
        }
        setOfflineStatus(
            hasForm ? 'is-ready' : 'is-online',
            hasForm ? 'הטופס מוכן לעבודה ללא קליטה' : 'מחובר לאינטרנט',
            hasForm
                ? 'אפשר להמשיך גם אם החיבור ייעלם. הטופס והתמונות יישמרו במכשיר עד לסנכרון.'
                : 'בחרו פרויקט ודייר ופתחו את הטופס פעם אחת כדי להכין אותו לעבודה ללא קליטה.'
        );
    };

    if (offlineSupported) {
        navigator.serviceWorker.addEventListener('message', async (event) => {
            const data = event.data || {};
            if (data.type === 'HANDOVER_QUEUE_STATUS') {
                await refreshOfflineQueueBadge(Number(data.pending || 0));
                if (data.syncing) setOfflineStatus('is-syncing', 'מסנכרן מסירות שמורות', 'הנתונים והתמונות מועלים כעת לשרת.');
            }
            if (data.type === 'HANDOVER_SYNC_SUCCESS') {
                await refreshOfflineQueueBadge();
                setOfflineStatus(
                    data.notificationsSent === false ? 'is-error' : 'is-ready',
                    data.notificationsSent === false ? 'המסירה נשמרה — הודעת דוא״ל דורשת בדיקה' : 'המסירה סונכרנה בהצלחה',
                    `מספר מסירה: ${data.handoverId || 'נשמר בשרת'}`
                );
                const submit = document.querySelector('[data-handover-submit]');
                if (submit && (!activeHandoverQueueId || activeHandoverQueueId === data.queueId)) {
                    submit.disabled = true;
                    submit.textContent = 'נשמר ונשלח';
                }
                if (activeHandoverQueueId === data.queueId) {
                    window.setTimeout(() => {
                        window.location.href = `/staff-expenses/?tab=handovers&submitted=${encodeURIComponent(data.handoverId || '')}`;
                    }, 1200);
                }
            }
            if (data.type === 'HANDOVER_SYNC_AUTH_REQUIRED') {
                setOfflineStatus('is-error', 'המסירה שמורה — נדרשת כניסה מחדש', 'התחברו שוב לאזור העובדים. לאחר הכניסה הסנכרון יימשך אוטומטית.');
            }
            if (data.type === 'HANDOVER_SYNC_ERROR') {
                setOfflineStatus('is-error', 'המסירה נשארה שמורה במכשיר', data.message || 'הסנכרון ינסה שוב אוטומטית כאשר החיבור יהיה יציב.');
                const submit = document.querySelector('[data-handover-submit]');
                if (submit && activeHandoverQueueId === data.queueId) {
                    submit.disabled = true;
                    submit.textContent = 'נשמר וממתין לסנכרון';
                }
            }
        });

        navigator.serviceWorker.register('/staff-expenses/offline-worker.js', { scope: '/staff-expenses/' })
            .then(async (registration) => {
                offlineRegistration = registration;
                await navigator.serviceWorker.ready;
                cacheCurrentHandoverPage();
                await updateConnectionStatus();
                if (navigator.onLine) await requestHandoverSync();
            })
            .catch(() => setOfflineStatus('is-error', 'לא ניתן להכין מצב ללא קליטה', 'רעננו את העמוד בזמן שיש חיבור ונסו שוב.'));

        window.addEventListener('online', async () => {
            await updateConnectionStatus();
            await requestHandoverSync();
        });
        window.addEventListener('offline', updateConnectionStatus);

        document.querySelectorAll('form').forEach((candidate) => {
            if (candidate.querySelector('input[name="action"][value="logout"]')) {
                candidate.addEventListener('submit', () => {
                    (offlineRegistration?.active || offlineRegistration?.waiting)?.postMessage({ type: 'CLEAR_OFFLINE_HANDOVERS' });
                    indexedDB.deleteDatabase(offlineDatabaseName);
                });
            }
        });
    }

    const reportType = document.getElementById('report-type');
    const sections = Array.from(document.querySelectorAll('[data-report-section]'));

    const setSectionState = () => {
        if (!reportType) return;
        const selected = reportType.value;
        sections.forEach((section) => {
            const active = section.dataset.reportSection === selected;
            section.hidden = !active;
            section.querySelectorAll('input, select, textarea, button').forEach((control) => {
                if (control.type === 'button') {
                    control.disabled = !active;
                    return;
                }
                control.disabled = !active;
                if (control.dataset.required === 'true') {
                    control.required = active;
                }
            });
        });

        if (selected === 'travel') {
            const employeeName = document.querySelector('input[name="employee_name"]');
            const travelerName = document.querySelector('input[name="traveler_name"]');
            if (employeeName && travelerName && !travelerName.value) {
                travelerName.value = employeeName.value;
            }
        }
    };

    reportType?.addEventListener('change', setSectionState);
    setSectionState();

    const travelBody = document.getElementById('travel-items');
    const travelTemplate = document.getElementById('travel-row-template');
    const addTravelRow = document.getElementById('add-travel-row');
    const totalsBox = document.getElementById('travel-totals');

    const updateTravelTotals = () => {
        if (!travelBody || !totalsBox) return;
        const symbols = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };
        const totals = {};
        travelBody.querySelectorAll('.travel-item-row').forEach((row) => {
            const amount = Number(row.querySelector('[name="travel_item_amount[]"]')?.value || 0);
            const currency = row.querySelector('[name="travel_item_currency[]"]')?.value || 'ILS';
            if (Number.isFinite(amount) && amount > 0) {
                totals[currency] = (totals[currency] || 0) + amount;
            }
        });
        const parts = Object.entries(totals).map(([currency, amount]) => `${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbols[currency] || currency}`);
        totalsBox.textContent = parts.length ? `סה״כ לפי מטבע: ${parts.join(' · ')}` : 'סה״כ לפי מטבע: טרם הוזנו סכומים';
    };

    const bindTravelRow = (row) => {
        row.querySelector('.remove-travel-row')?.addEventListener('click', () => {
            if (!travelBody) return;
            const rows = travelBody.querySelectorAll('.travel-item-row');
            if (rows.length === 1) {
                row.querySelectorAll('input').forEach((input) => { input.value = ''; });
                row.querySelectorAll('select').forEach((select, index) => { select.selectedIndex = index === 1 ? 0 : 0; });
            } else {
                row.remove();
            }
            updateTravelTotals();
        });
        row.querySelectorAll('input, select').forEach((control) => {
            control.addEventListener('input', updateTravelTotals);
            control.addEventListener('change', updateTravelTotals);
        });
    };

    travelBody?.querySelectorAll('.travel-item-row').forEach(bindTravelRow);
    addTravelRow?.addEventListener('click', () => {
        if (!travelBody || !travelTemplate) return;
        if (travelBody.querySelectorAll('.travel-item-row').length >= 50) return;
        const fragment = travelTemplate.content.cloneNode(true);
        const row = fragment.querySelector('.travel-item-row');
        if (row) bindTravelRow(row);
        travelBody.appendChild(fragment);
        updateTravelTotals();
    });

    const fileInput = document.getElementById('attachments');
    const cameraInput = document.getElementById('camera-receipts');
    const fileInputs = [fileInput, cameraInput].filter(Boolean);
    const selectedFiles = document.getElementById('selected-files');
    const uploadZone = document.querySelector('label[for="attachments"]');

    const allSelectedFiles = () => fileInputs.flatMap((input) => Array.from(input.files || []));

    const renderFiles = () => {
        if (!selectedFiles) return;
        selectedFiles.innerHTML = '';
        const files = allSelectedFiles();
        if (!files.length) return;
        files.forEach((file) => {
            const item = document.createElement('div');
            item.className = 'selected-file';
            const name = document.createElement('span');
            name.textContent = file.name;
            const size = document.createElement('span');
            size.textContent = `${(file.size / 1024 / 1024).toLocaleString('he-IL', { maximumFractionDigits: 2 })} MB`;
            item.append(name, size);
            selectedFiles.appendChild(item);
        });
    };

    fileInputs.forEach((input) => input.addEventListener('change', renderFiles));
    ['dragenter', 'dragover'].forEach((eventName) => uploadZone?.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadZone.classList.add('is-dragging');
    }));
    uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragging'));
    uploadZone?.addEventListener('drop', (event) => {
        event.preventDefault();
        uploadZone.classList.remove('is-dragging');
        if (!fileInput || !event.dataTransfer?.files?.length) return;
        fileInput.files = event.dataTransfer.files;
        renderFiles();
    });

    const noReceipt = document.getElementById('no-receipt');
    const noReceiptWrap = document.getElementById('no-receipt-reason-wrap');
    const noReceiptText = noReceiptWrap?.querySelector('textarea');
    const updateNoReceipt = () => {
        if (!noReceipt || !noReceiptWrap || !noReceiptText) return;
        noReceiptWrap.hidden = !noReceipt.checked;
        noReceiptText.required = noReceipt.checked;
        if (!noReceipt.checked) noReceiptText.value = '';
    };
    noReceipt?.addEventListener('change', updateNoReceipt);
    updateNoReceipt();

    const form = document.getElementById('report-form');
    const submitButton = document.getElementById('submit-report');
    form?.addEventListener('submit', (event) => {
        const files = allSelectedFiles();
        if (files.length > 20) {
            event.preventDefault();
            window.alert('ניתן לצרף עד 20 קבצים בכל דיווח.');
            return;
        }
        if (files.some((file) => file.size > 12 * 1024 * 1024)) {
            event.preventDefault();
            window.alert('כל קובץ חייב להיות קטן מ-12MB.');
            return;
        }
        if (!files.length && !(noReceipt?.checked)) {
            event.preventDefault();
            window.alert('חובה לצרף קבלה או חשבונית, או לסמן שאין מסמך ולציין סיבה.');
            return;
        }
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'שומר ומעלה מסמכים...';
        }
    });

    const handoverSelector = document.querySelector('[data-handover-selector]');
    handoverSelector?.querySelectorAll('[data-handover-autosubmit]').forEach((control) => {
        control.addEventListener('change', () => handoverSelector.requestSubmit());
    });

    const offlinePrepareButton = handoverSelector?.querySelector('[data-handover-offline-prepare]');
    const offlinePrepareNote = handoverSelector?.querySelector('[data-handover-offline-prepare-note]');
    offlinePrepareButton?.addEventListener('click', async () => {
        if (!navigator.onLine) {
            window.alert('הכנת פרויקט חדש דורשת חיבור. טפסים שכבר הוכנו ממשיכים לעבוד ללא קליטה.');
            return;
        }
        if (!offlineSupported || !offlineRegistration) {
            window.alert('מצב Offline עדיין לא מוכן. המתינו מספר שניות או רעננו את העמוד.');
            return;
        }
        const projectId = handoverSelector.querySelector('[name="handover_project"]')?.value || '';
        const residentIds = Array.from(handoverSelector.querySelectorAll('[data-handover-offline-resident-id]'))
            .map((item) => item.dataset.handoverOfflineResidentId || '')
            .filter(Boolean);
        if (!projectId || residentIds.length < 1) {
            window.alert('יש לבחור פרויקט הכולל דיירים לפני ההכנה לעבודה ללא קליטה.');
            return;
        }

        offlinePrepareButton.disabled = true;
        const originalLabel = offlinePrepareButton.textContent;
        let prepared = 0;
        try {
            await storeHandoverPageOffline(
                window.location.href,
                `<!doctype html>\n${document.documentElement.outerHTML}`
            );
            for (const residentId of residentIds) {
                offlinePrepareButton.textContent = `מכין ${prepared + 1} מתוך ${residentIds.length}…`;
                setOfflineStatus('is-syncing', 'מכין את הפרויקט לעבודה ללא קליטה', `${prepared} מתוך ${residentIds.length} טפסי דיירים נשמרו במכשיר.`);
                const residentUrl = new URL('/staff-expenses/', window.location.origin);
                residentUrl.searchParams.set('tab', 'handovers');
                residentUrl.searchParams.set('handover_project', projectId);
                residentUrl.searchParams.set('handover_resident', residentId);
                const response = await fetch(residentUrl.href, {
                    credentials: 'include',
                    cache: 'no-store',
                    headers: { 'X-Ifeel-Offline-Prepare': '1' },
                });
                if (!response.ok || response.headers.get('X-Ifeel-Offline-Cache') !== 'handover') {
                    throw new Error('offline-project-fetch-failed');
                }
                const html = await response.text();
                if (!html.includes('data-handover-form')) throw new Error('offline-project-form-missing');
                await storeHandoverPageOffline(residentUrl.href, html);
                prepared += 1;
            }
            offlinePrepareButton.textContent = 'הפרויקט מוכן ללא קליטה';
            if (offlinePrepareNote) offlinePrepareNote.textContent = `${prepared} טפסי דיירים נשמרו במכשיר זה. ניתן לעבור ביניהם גם ללא אינטרנט.`;
            setOfflineStatus('is-ready', 'הפרויקט מוכן לעבודה ללא קליטה', `${prepared} טפסי דיירים זמינים במכשיר. מסירות חדשות יישמרו ויסתנכרנו אוטומטית.`);
        } catch (error) {
            offlinePrepareButton.disabled = false;
            offlinePrepareButton.textContent = originalLabel;
            setOfflineStatus('is-error', 'הכנת הפרויקט נעצרה', `${prepared} מתוך ${residentIds.length} טפסים נשמרו. ודאו שהחיבור יציב ונסו שוב.`);
        }
    });

    const handoverLocation = document.querySelector('[data-handover-location]');
    const handoverLocationOther = document.querySelector('[data-handover-location-other]');
    const handoverLocationOtherInput = handoverLocationOther?.querySelector('input');
    const updateHandoverLocation = () => {
        if (!handoverLocation || !handoverLocationOther || !handoverLocationOtherInput) return;
        const isOther = handoverLocation.value === 'other';
        handoverLocationOther.hidden = !isOther;
        handoverLocationOtherInput.required = isOther;
        if (!isOther) handoverLocationOtherInput.value = '';
    };
    handoverLocation?.addEventListener('change', updateHandoverLocation);
    updateHandoverLocation();

    const handoverForm = document.querySelector('[data-handover-form]');
    const handoverReady = handoverForm?.querySelector('[data-handover-ready]');
    const handoverCloudLinkField = handoverForm?.querySelector('[data-handover-cloud-link-field]');
    const handoverCloudLink = handoverForm?.querySelector('[data-handover-cloud-link]');
    const handoverCloudCopy = handoverForm?.querySelector('[data-handover-cloud-copy]');
    const handoverCloudCopyStatus = handoverForm?.querySelector('[data-handover-cloud-copy-status]');
    const handoverRecipientFields = handoverForm?.querySelector('[data-handover-recipient-fields]');
    const handoverRecipientName = handoverForm?.querySelector('[data-handover-recipient-name]');
    const handoverSignatureCanvas = handoverForm?.querySelector('[data-handover-signature-canvas]');
    const handoverSignatureValue = handoverForm?.querySelector('[data-handover-signature-value]');
    const handoverSignatureClear = handoverForm?.querySelector('[data-handover-signature-clear]');
    const handoverSignatureHint = handoverForm?.querySelector('[data-handover-signature-hint]');
    const signatureContext = handoverSignatureCanvas?.getContext('2d');
    let signatureDrawing = false;
    let signatureHasInk = false;

    const clearHandoverSignature = () => {
        if (!handoverSignatureCanvas || !signatureContext) return;
        signatureContext.fillStyle = '#ffffff';
        signatureContext.fillRect(0, 0, handoverSignatureCanvas.width, handoverSignatureCanvas.height);
        signatureContext.strokeStyle = '#10233f';
        signatureContext.lineWidth = 4;
        signatureContext.lineCap = 'round';
        signatureContext.lineJoin = 'round';
        signatureHasInk = false;
        if (handoverSignatureValue) handoverSignatureValue.value = '';
        if (handoverSignatureHint) handoverSignatureHint.hidden = false;
    };

    const signaturePoint = (event) => {
        const bounds = handoverSignatureCanvas.getBoundingClientRect();
        return {
            x: (event.clientX - bounds.left) * handoverSignatureCanvas.width / bounds.width,
            y: (event.clientY - bounds.top) * handoverSignatureCanvas.height / bounds.height,
        };
    };

    handoverSignatureCanvas?.addEventListener('pointerdown', (event) => {
        if (!signatureContext) return;
        event.preventDefault();
        signatureDrawing = true;
        signatureHasInk = true;
        handoverSignatureCanvas.setPointerCapture?.(event.pointerId);
        const point = signaturePoint(event);
        signatureContext.beginPath();
        signatureContext.moveTo(point.x, point.y);
        signatureContext.lineTo(point.x + 0.1, point.y + 0.1);
        signatureContext.stroke();
        if (handoverSignatureHint) handoverSignatureHint.hidden = true;
    });
    handoverSignatureCanvas?.addEventListener('pointermove', (event) => {
        if (!signatureDrawing || !signatureContext) return;
        event.preventDefault();
        const point = signaturePoint(event);
        signatureContext.lineTo(point.x, point.y);
        signatureContext.stroke();
    });
    const finishHandoverSignature = () => {
        if (!signatureDrawing || !handoverSignatureCanvas || !handoverSignatureValue) return;
        signatureDrawing = false;
        handoverSignatureValue.value = signatureHasInk ? handoverSignatureCanvas.toDataURL('image/png') : '';
    };
    handoverSignatureCanvas?.addEventListener('pointerup', finishHandoverSignature);
    handoverSignatureCanvas?.addEventListener('pointercancel', finishHandoverSignature);
    handoverSignatureCanvas?.addEventListener('pointerleave', finishHandoverSignature);
    handoverSignatureClear?.addEventListener('click', clearHandoverSignature);
    clearHandoverSignature();

    handoverCloudCopy?.addEventListener('click', async () => {
        const value = handoverCloudLink?.textContent?.trim() || '';
        if (!value) return;
        try {
            let copied = false;
            if (navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(value);
                    copied = true;
                } catch {
                    // Offline/non-secure contexts can reject the modern clipboard API.
                }
            }
            if (!copied) {
                const helper = document.createElement('textarea');
                helper.value = value;
                helper.setAttribute('readonly', '');
                helper.style.position = 'fixed';
                helper.style.opacity = '0';
                document.body.appendChild(helper);
                try {
                    helper.select();
                    copied = document.execCommand('copy');
                } finally {
                    helper.remove();
                }
            }
            if (!copied) throw new Error('copy failed');
            handoverCloudCopy.textContent = 'הקישור הועתק';
            if (handoverCloudCopyStatus) handoverCloudCopyStatus.textContent = 'אפשר להדביק אותו כעת בהגדרת הקונטרולר.';
        } catch {
            if (handoverCloudCopyStatus) handoverCloudCopyStatus.textContent = 'לא ניתן להעתיק אוטומטית. לחצו לחיצה ארוכה על הקישור והעתיקו אותו.';
        }
    });

    const updateHandoverDelivery = () => {
        if (!handoverReady) return;
        const isDelivered = handoverReady.value === 'ready_delivered';
        if (handoverCloudLinkField) {
            const cloudAvailable = handoverCloudLinkField.dataset.handoverCloudAvailable === '1';
            handoverReady.setCustomValidity(isDelivered && !cloudAvailable
                ? 'לא נמצא קישור ענן מאומת לדייר בקובץ Google Drive של הפרויקט.'
                : '');
        }
        if (handoverRecipientFields && handoverRecipientName) {
            handoverRecipientFields.hidden = !isDelivered;
            handoverRecipientName.required = isDelivered;
            if (!isDelivered) {
                handoverRecipientName.value = '';
                clearHandoverSignature();
            }
        }
    };
    handoverReady?.addEventListener('change', updateHandoverDelivery);
    updateHandoverDelivery();

    const switch9CountInput = handoverForm?.querySelector('[data-handover-switch-9-count]');
    const switch9Units = handoverForm?.querySelector('[data-handover-switch-9-units]');
    const switch9Template = handoverForm?.querySelector('[data-handover-switch-9-template]');
    const updateSwitch9Units = () => {
        if (!switch9CountInput || !switch9Units || !switch9Template) return;
        const parsedCount = Number.parseInt(switch9CountInput.value, 10);
        if (!Number.isFinite(parsedCount)) return;
        const count = Math.max(1, Math.min(50, parsedCount));
        if (String(count) !== switch9CountInput.value) switch9CountInput.value = String(count);

        let units = Array.from(switch9Units.querySelectorAll('[data-handover-switch-9-unit]'));
        while (units.length < count) {
            const unit = switch9Template.content.firstElementChild?.cloneNode(true);
            if (!unit) break;
            switch9Units.appendChild(unit);
            units.push(unit);
        }
        while (units.length > count) {
            units.pop()?.remove();
        }
        units.forEach((unit, index) => {
            const number = index + 1;
            const legend = unit.querySelector('[data-handover-switch-9-legend]');
            const configuration = unit.querySelector('[data-handover-switch-9-configuration]');
            const configurationLabel = unit.querySelector('[data-handover-switch-9-configuration-label]');
            const location = unit.querySelector('[data-handover-switch-9-location]');
            const photo = unit.querySelector('[data-handover-switch-9-photo]');
            const photoHeading = unit.querySelector('[data-handover-switch-9-photo-heading]');
            const photoLabel = unit.querySelector('[data-handover-switch-9-photo-label]');
            if (legend) legend.textContent = `מפסק 9 מס׳ ${number} — סיווג, מיקום וצילום`;
            if (configuration) configuration.name = `handover_switch_9_configuration_${number}`;
            if (configurationLabel) configurationLabel.innerHTML = `סיווג מפסק 9 מס׳ ${number} <b>*</b>`;
            if (location) location.name = `handover_switch_9_location_${number}`;
            if (photo) photo.name = `handover_switch_photo_${number}`;
            if (photoHeading) photoHeading.innerHTML = `צילום מפסק 9 מס׳ ${number} <b>*</b>`;
            if (photoLabel) photoLabel.textContent = `צילום מפסק 9 מס׳ ${number} עם האייקונים`;
        });
    };
    switch9CountInput?.addEventListener('input', updateSwitch9Units);
    switch9CountInput?.addEventListener('change', updateSwitch9Units);
    updateSwitch9Units();

    const componentPanelPresence = handoverForm?.querySelector('[data-handover-component-panel-presence]');
    const componentPanels = handoverForm?.querySelector('[data-handover-component-panels]');
    const componentSwitchStatus = handoverForm?.querySelector('[data-handover-component-switch-status]');
    const componentSwitchStatusOtherField = handoverForm?.querySelector('[data-handover-component-switch-status-other]');
    const componentSwitchStatusOtherInput = componentSwitchStatusOtherField?.querySelector('input');
    const updateComponentSwitchStatusOther = () => {
        if (!componentSwitchStatusOtherField || !componentSwitchStatusOtherInput) return;
        const isOther = componentPanelPresence?.value === 'has_panels' && componentSwitchStatus?.value === 'other';
        componentSwitchStatusOtherField.hidden = !isOther;
        componentSwitchStatusOtherInput.required = isOther;
        if (!isOther) componentSwitchStatusOtherInput.value = '';
    };
    const updateComponentPanels = () => {
        if (!componentPanels || !componentSwitchStatus) return;
        const hasPanels = componentPanelPresence?.value === 'has_panels';
        componentPanels.hidden = !hasPanels;
        componentPanels.querySelectorAll('input[type="number"]').forEach((input) => {
            input.required = hasPanels;
            if (!hasPanels) input.value = '0';
        });
        componentSwitchStatus.required = hasPanels;
        if (!hasPanels) componentSwitchStatus.value = '';
        updateComponentSwitchStatusOther();
    };
    componentPanelPresence?.addEventListener('change', updateComponentPanels);
    componentSwitchStatus?.addEventListener('change', updateComponentSwitchStatusOther);
    updateComponentPanels();

    const issueCountInput = handoverForm?.querySelector('[data-handover-issue-count]');
    const issueList = handoverForm?.querySelector('[data-handover-issue-list]');
    const issueTemplate = handoverForm?.querySelector('[data-handover-issue-template]');
    const issueAddButton = handoverForm?.querySelector('[data-handover-issue-add]');
    const refreshIssues = () => {
        if (!issueCountInput || !issueList) return;
        const issues = Array.from(issueList.querySelectorAll('[data-handover-issue]'));
        issueCountInput.value = String(issues.length);
        issues.forEach((issue, index) => {
            const number = index + 1;
            const legend = issue.querySelector('[data-handover-issue-legend]');
            const photoHeading = issue.querySelector('[data-handover-issue-photo-heading]');
            const photoLabel = issue.querySelector('[data-handover-issue-photo-label]');
            const photo = issue.querySelector('[data-handover-issue-photo]');
            const type = issue.querySelector('[data-handover-issue-type]');
            const descriptionField = issue.querySelector('[data-handover-issue-description-field]');
            const description = issue.querySelector('[data-handover-issue-description]');
            if (legend) legend.textContent = `תקלה מס׳ ${number}`;
            if (photoHeading) photoHeading.innerHTML = `צילום תקלה מס׳ ${number} <b>*</b>`;
            if (photoLabel) photoLabel.textContent = `צילום תקלה מס׳ ${number}`;
            if (photo) photo.name = `handover_issue_photo_${number}`;
            if (type) type.name = `handover_issue_type_${number}`;
            if (description) description.name = `handover_issue_description_${number}`;
            if (descriptionField && description) {
                const isOther = type?.value === 'other';
                descriptionField.hidden = !isOther;
                description.required = isOther;
                if (!isOther) description.value = '';
            }
        });
    };
    issueAddButton?.addEventListener('click', () => {
        if (!issueList || !issueTemplate) return;
        if (issueList.querySelectorAll('[data-handover-issue]').length >= 15) {
            window.alert('ניתן להוסיף עד 15 צילומי תקלות במסירה אחת.');
            return;
        }
        const issue = issueTemplate.content.firstElementChild?.cloneNode(true);
        if (!issue) return;
        issueList.appendChild(issue);
        refreshIssues();
        issue.querySelector('[data-handover-issue-photo]')?.focus();
    });
    issueList?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const removeButton = target?.closest('[data-handover-issue-remove]');
        if (!removeButton) return;
        removeButton.closest('[data-handover-issue]')?.remove();
        refreshIssues();
    });
    issueList?.addEventListener('change', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.matches('[data-handover-issue-type]')) refreshIssues();
    });
    refreshIssues();

    const handoverSubmit = handoverForm?.querySelector('[data-handover-submit]');
    handoverForm?.addEventListener('submit', (event) => {
        if (handoverReady?.value === 'ready_delivered') {
            if (signatureHasInk && handoverSignatureCanvas && handoverSignatureValue && !handoverSignatureValue.value) {
                handoverSignatureValue.value = handoverSignatureCanvas.toDataURL('image/png');
            }
            if (!handoverRecipientName?.value.trim() || !handoverSignatureValue?.value.startsWith('data:image/png;base64,')) {
                event.preventDefault();
                window.alert('במסירה ללקוח או לנציג חובה למלא את שם המקבל ולהחתים אותו על המסך.');
                return;
            }
        }
        const photoInputs = Array.from(handoverForm.querySelectorAll('input[type="file"]'));
        const photos = photoInputs.map((input) => input.files?.[0]).filter(Boolean);
        const switch9Count = Number.parseInt(switch9CountInput?.value || '0', 10);
        const issueCount = Number.parseInt(issueCountInput?.value || '0', 10);
        const expectedPhotoCount = switch9Count + issueCount + 1;
        if (photoInputs.length !== expectedPhotoCount || photos.length !== expectedPhotoCount) {
            event.preventDefault();
            window.alert('יש לצרף צילום קונטרולר, צילום לכל מפסק 9 וצילום לכל תקלה שנוספה.');
            return;
        }
        if (photos.some((file) => !file.type.startsWith('image/'))) {
            event.preventDefault();
            window.alert('כל הקבצים חייבים להיות תמונות.');
            return;
        }
        if (photos.some((file) => file.size > 12 * 1024 * 1024)) {
            event.preventDefault();
            window.alert('כל תמונה חייבת להיות קטנה מ-12MB.');
            return;
        }
        if (offlineSupported) {
            event.preventDefault();
            const entry = handoverFormEntry(handoverForm);
            if (!entry.id || !entry.projectId || !entry.residentId) {
                window.alert('לא ניתן להכין את המסירה לשמירה מקומית. רעננו את הטופס ונסו שוב.');
                return;
            }
            if (handoverSubmit) {
                handoverSubmit.disabled = true;
                handoverSubmit.textContent = navigator.onLine ? 'שומר ומסנכרן…' : 'שומר במכשיר…';
            }
            saveOfflineHandover(entry).then(async () => {
                activeHandoverQueueId = entry.id;
                await refreshOfflineQueueBadge();
                setOfflineStatus(
                    navigator.onLine ? 'is-syncing' : 'is-offline',
                    navigator.onLine ? 'המסירה נשמרה במכשיר ומסתנכרנת' : 'המסירה נשמרה במכשיר',
                    navigator.onLine ? 'הנתונים והתמונות מועלים כעת לשרת.' : 'אפשר לצאת מהשטח. הסנכרון יתחיל אוטומטית לאחר חזרת האינטרנט.'
                );
                if (handoverSubmit && !navigator.onLine) handoverSubmit.textContent = 'נשמר וממתין לחיבור';
                await requestHandoverSync();
            }).catch(() => {
                if (handoverSubmit) {
                    handoverSubmit.disabled = false;
                    handoverSubmit.textContent = 'סיום ושליחה';
                }
                setOfflineStatus('is-error', 'השמירה במכשיר נכשלה', 'אין לסגור את הטופס. פנו שטח אחסון במכשיר ונסו שוב.');
            });
            return;
        }
        if (handoverSubmit) {
            handoverSubmit.disabled = true;
            handoverSubmit.textContent = 'שומר ושולח...';
        }
    });
})();
