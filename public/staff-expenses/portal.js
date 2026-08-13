(() => {
    'use strict';

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
            const location = unit.querySelector('[data-handover-switch-9-location]');
            if (legend) legend.textContent = `מפסק 9 מס׳ ${number}`;
            if (configuration) configuration.name = `handover_switch_9_configuration_${number}`;
            if (location) location.name = `handover_switch_9_location_${number}`;
        });
    };
    switch9CountInput?.addEventListener('input', updateSwitch9Units);
    switch9CountInput?.addEventListener('change', updateSwitch9Units);
    updateSwitch9Units();

    handoverForm?.querySelectorAll('[data-handover-component-count]').forEach((countInput) => {
        const component = countInput.dataset.handoverComponentCount;
        const locationField = handoverForm.querySelector(`[data-handover-component-location="${component}"]`);
        const locationInput = locationField?.querySelector('input');
        const updateComponentLocation = () => {
            if (!locationField || !locationInput) return;
            const hasComponents = Number.parseInt(countInput.value, 10) > 0;
            locationField.hidden = !hasComponents;
            locationInput.required = hasComponents;
            if (!hasComponents) locationInput.value = '';
        };
        countInput.addEventListener('input', updateComponentLocation);
        updateComponentLocation();
    });

    const handoverSubmit = handoverForm?.querySelector('[data-handover-submit]');
    handoverForm?.addEventListener('submit', (event) => {
        const photoInputs = Array.from(handoverForm.querySelectorAll('input[type="file"]'));
        const photos = photoInputs.map((input) => input.files?.[0]).filter(Boolean);
        if (photos.length !== 2) {
            event.preventDefault();
            window.alert('חובה לצרף צילום קונטרולר וצילום מפסק 9.');
            return;
        }
        if (photos.some((file) => !file.type.startsWith('image/'))) {
            event.preventDefault();
            window.alert('שני הקבצים חייבים להיות תמונות.');
            return;
        }
        if (photos.some((file) => file.size > 12 * 1024 * 1024)) {
            event.preventDefault();
            window.alert('כל תמונה חייבת להיות קטנה מ-12MB.');
            return;
        }
        if (handoverSubmit) {
            handoverSubmit.disabled = true;
            handoverSubmit.textContent = 'שומר ושולח...';
        }
    });
})();
