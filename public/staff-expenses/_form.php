<?php
declare(strict_types=1);

function portal_render_new_form(array $user, ?array $flash): void
{
    $today = date('Y-m-d');
    portal_render_flash($flash);
    ?>
    <section class="page-heading">
        <div>
            <p class="eyebrow">טופס פנימי מאובטח</p>
            <h1>דיווח הוצאה חדש</h1>
            <p>יש למלא דיווח נפרד לכל הוצאה, טיפול או נסיעה. בנסיעה לחו״ל ניתן לרכז את כל הוצאות הנסיעה בדיווח אחד.</p>
        </div>
        <div class="privacy-box">
            <strong>המסמכים נשמרים מחוץ לתיקיית האתר</strong>
            <span>קבלות וחשבוניות אינן נגישות בקישור ציבורי וניתנות להורדה רק למנהל מורשה.</span>
        </div>
    </section>

    <form method="post" enctype="multipart/form-data" class="report-form" id="report-form">
        <noscript><div class="alert alert--error">למילוי הטופס יש להפעיל JavaScript בדפדפן.</div></noscript>
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="submit_report">
        <input type="hidden" name="MAX_FILE_SIZE" value="<?= IFEEL_PORTAL_MAX_FILE_BYTES ?>">

        <section class="form-card">
            <div class="form-card__header">
                <span class="step">1</span>
                <div><h2>מי מדווח ומה סוג ההוצאה?</h2><p>הפרטים ישמשו לזיהוי ולאישור ההוצאה.</p></div>
            </div>
            <div class="field-grid field-grid--2">
                <label class="field field--full">
                    <span>סוג דיווח <b>*</b></span>
                    <select name="report_type" id="report-type" required>
                        <option value="vehicle">רכב, טיפול, חניה ונסיעות בארץ</option>
                        <option value="travel">נסיעה לחו״ל</option>
                        <option value="general">הוצאה כללית</option>
                    </select>
                </label>
                <label class="field">
                    <span>שם העובד/ת <b>*</b></span>
                    <input type="text" name="employee_name" required maxlength="120" autocomplete="name" value="<?= portal_h(($user['username'] ?? '') === 'employee' ? '' : ($user['display_name'] ?? '')) ?>">
                </label>
                <label class="field">
                    <span>מחלקה</span>
                    <input type="text" name="department" maxlength="120" placeholder="לדוגמה: פרויקטים, שירות, מכירות">
                </label>
                <label class="field">
                    <span>דוא״ל</span>
                    <input type="email" name="employee_email" maxlength="160" autocomplete="email">
                </label>
                <label class="field">
                    <span>טלפון</span>
                    <input type="tel" name="employee_phone" maxlength="60" autocomplete="tel">
                </label>
            </div>
        </section>

        <section class="form-card report-section" data-report-section="vehicle">
            <div class="form-card__header">
                <span class="step">2</span>
                <div><h2>פרטי הוצאת רכב או נסיעה בארץ</h2><p>מתאים לדלק, טיפולים, תיקונים, חניה, אגרות, מוניות והשכרת רכב.</p></div>
            </div>
            <div class="field-grid field-grid--3">
                <label class="field">
                    <span>תאריך ההוצאה <b>*</b></span>
                    <input type="date" name="vehicle_expense_date" value="<?= portal_h($today) ?>" data-required="true">
                </label>
                <label class="field">
                    <span>סוג הוצאה <b>*</b></span>
                    <select name="vehicle_category" data-required="true">
                        <option value="">בחירה</option>
                        <option value="fuel">דלק</option>
                        <option value="service">טיפול תקופתי</option>
                        <option value="repair">תיקון</option>
                        <option value="parking">חניה</option>
                        <option value="toll">כבישי אגרה</option>
                        <option value="insurance">ביטוח</option>
                        <option value="licensing">רישוי / טסט</option>
                        <option value="washing">שטיפה</option>
                        <option value="rental">השכרת רכב</option>
                        <option value="transport">מונית / תחבורה</option>
                        <option value="other">אחר</option>
                    </select>
                </label>
                <label class="field">
                    <span>מספר רכב <b>*</b></span>
                    <input type="text" name="vehicle_plate" maxlength="40" data-required="true" placeholder="00-000-00">
                </label>
                <label class="field">
                    <span>דגם / תיאור הרכב</span>
                    <input type="text" name="vehicle_model" maxlength="120" placeholder="לדוגמה: סקודה אוקטביה">
                </label>
                <label class="field">
                    <span>נהג/ת</span>
                    <input type="text" name="vehicle_driver" maxlength="120">
                </label>
                <label class="field">
                    <span>קילומטראז׳</span>
                    <input type="number" name="odometer" min="0" max="9999999" inputmode="numeric">
                </label>
                <label class="field">
                    <span>ספק / בית עסק</span>
                    <input type="text" name="vehicle_supplier" maxlength="160">
                </label>
                <label class="field">
                    <span>מספר חשבונית / קבלה</span>
                    <input type="text" name="vehicle_invoice_number" maxlength="100">
                </label>
                <label class="field">
                    <span>סכום <b>*</b></span>
                    <input type="number" name="vehicle_amount" min="0.01" max="100000000" step="0.01" inputmode="decimal" data-required="true">
                </label>
                <label class="field">
                    <span>מטבע <b>*</b></span>
                    <select name="vehicle_currency" data-required="true">
                        <option value="ILS">ש״ח</option><option value="USD">דולר</option><option value="EUR">אירו</option><option value="GBP">ליש״ט</option>
                    </select>
                </label>
                <label class="field">
                    <span>אמצעי תשלום</span>
                    <select name="vehicle_payment_method">
                        <option value="">בחירה</option><option value="company_card">כרטיס חברה</option><option value="private_card">כרטיס פרטי</option><option value="cash">מזומן</option><option value="bank_transfer">העברה בנקאית</option><option value="other">אחר</option>
                    </select>
                </label>
                <label class="field">
                    <span>פרויקט / לקוח</span>
                    <input type="text" name="vehicle_project_customer" maxlength="160">
                </label>
                <label class="field field--full">
                    <span>תיאור והערות</span>
                    <textarea name="vehicle_description" rows="3" maxlength="2000"></textarea>
                </label>
            </div>
        </section>

        <section class="form-card report-section" data-report-section="travel" hidden>
            <div class="form-card__header">
                <span class="step">2</span>
                <div><h2>פרטי נסיעה לחו״ל</h2><p>יש לצרף כרטיסי טיסה, חשבוניות מלון, אוכל, רכב שכור, תחבורה וכל מסמך רלוונטי.</p></div>
            </div>
            <div class="field-grid field-grid--3">
                <label class="field">
                    <span>שם החברה</span>
                    <input type="text" name="company_name" maxlength="120" value="I Feel">
                </label>
                <label class="field">
                    <span>שם הנוסע/ת <b>*</b></span>
                    <input type="text" name="traveler_name" maxlength="120" data-required="true">
                </label>
                <label class="field">
                    <span>תפקיד</span>
                    <input type="text" name="traveler_role" maxlength="120">
                </label>
                <label class="field field--full">
                    <span>מטרת הנסיעה <b>*</b></span>
                    <textarea name="trip_purpose" rows="3" maxlength="800" data-required="true"></textarea>
                </label>
                <label class="field field--full">
                    <span>יעד או יעדים <b>*</b></span>
                    <input type="text" name="destination" maxlength="300" data-required="true" placeholder="מדינה, עיר, לקוח או תערוכה">
                </label>
                <label class="field">
                    <span>תאריך יציאה <b>*</b></span>
                    <input type="date" name="departure_date" data-required="true">
                </label>
                <label class="field">
                    <span>תאריך חזרה <b>*</b></span>
                    <input type="date" name="return_date" data-required="true">
                </label>
                <label class="field">
                    <span>מספר ימי עבודה בחו״ל</span>
                    <input type="number" name="business_days" min="0" max="365" inputmode="numeric">
                </label>
                <label class="field">
                    <span>מספר הזמנה / PNR</span>
                    <input type="text" name="booking_reference" maxlength="120">
                </label>
                <label class="field field--full">
                    <span>הערות כלליות לנסיעה</span>
                    <textarea name="travel_notes" rows="3" maxlength="2000"></textarea>
                </label>
            </div>

            <div class="subsection-heading">
                <div><h3>פירוט הוצאות הנסיעה</h3><p>הוסיפו שורה לכל הוצאה. הסכומים מחושבים בנפרד לפי מטבע.</p></div>
                <button type="button" class="button button--secondary button--small" id="add-travel-row">הוספת שורה</button>
            </div>
            <div class="table-wrap">
                <table class="expense-table">
                    <thead><tr><th>סוג הוצאה</th><th>תאריך</th><th>ספק</th><th>סכום</th><th>מטבע</th><th>הערה</th><th></th></tr></thead>
                    <tbody id="travel-items">
                        <tr class="travel-item-row">
                            <td><select name="travel_item_category[]"><option value="">בחירה</option><option value="flight">טיסות וכרטיסי טיסה</option><option value="hotel">מלון / לינה</option><option value="meals">אוכל וארוחות</option><option value="car_rental">השכרת רכב</option><option value="local_transport">מוניות / תחבורה / נסיעות</option><option value="parking">חניה</option><option value="communications">תקשורת / סלולר</option><option value="insurance_visa">ביטוח / אשרה</option><option value="conference">כנס / תערוכה</option><option value="other">אחר</option></select></td>
                            <td><input type="date" name="travel_item_date[]"></td>
                            <td><input type="text" name="travel_item_vendor[]" maxlength="160"></td>
                            <td><input type="number" name="travel_item_amount[]" min="0.01" step="0.01" inputmode="decimal"></td>
                            <td><select name="travel_item_currency[]"><option value="ILS">ש״ח</option><option value="USD">דולר</option><option value="EUR">אירו</option><option value="GBP">ליש״ט</option></select></td>
                            <td><input type="text" name="travel_item_note[]" maxlength="500"></td>
                            <td><button type="button" class="icon-button remove-travel-row" aria-label="מחיקת שורה">×</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <template id="travel-row-template">
                <tr class="travel-item-row">
                    <td><select name="travel_item_category[]"><option value="">בחירה</option><option value="flight">טיסות וכרטיסי טיסה</option><option value="hotel">מלון / לינה</option><option value="meals">אוכל וארוחות</option><option value="car_rental">השכרת רכב</option><option value="local_transport">מוניות / תחבורה / נסיעות</option><option value="parking">חניה</option><option value="communications">תקשורת / סלולר</option><option value="insurance_visa">ביטוח / אשרה</option><option value="conference">כנס / תערוכה</option><option value="other">אחר</option></select></td>
                    <td><input type="date" name="travel_item_date[]"></td>
                    <td><input type="text" name="travel_item_vendor[]" maxlength="160"></td>
                    <td><input type="number" name="travel_item_amount[]" min="0.01" step="0.01" inputmode="decimal"></td>
                    <td><select name="travel_item_currency[]"><option value="ILS">ש״ח</option><option value="USD">דולר</option><option value="EUR">אירו</option><option value="GBP">ליש״ט</option></select></td>
                    <td><input type="text" name="travel_item_note[]" maxlength="500"></td>
                    <td><button type="button" class="icon-button remove-travel-row" aria-label="מחיקת שורה">×</button></td>
                </tr>
            </template>
            <div class="totals-box" id="travel-totals" aria-live="polite">סה״כ לפי מטבע: טרם הוזנו סכומים</div>
        </section>

        <section class="form-card report-section" data-report-section="general" hidden>
            <div class="form-card__header">
                <span class="step">2</span>
                <div><h2>פרטי הוצאה כללית</h2><p>לציוד, ספקים, תוכנות, משלוחים, אירוח וכל הוצאה שאינה רכב או נסיעה לחו״ל.</p></div>
            </div>
            <div class="field-grid field-grid--3">
                <label class="field"><span>תאריך ההוצאה <b>*</b></span><input type="date" name="general_expense_date" value="<?= portal_h($today) ?>" data-required="true"></label>
                <label class="field"><span>קטגוריה <b>*</b></span><select name="general_category" data-required="true"><option value="">בחירה</option><option value="office">משרד וציוד משרדי</option><option value="equipment">ציוד וכלים</option><option value="supplier">ספק / קבלן משנה</option><option value="hospitality">אירוח וכיבוד</option><option value="shipping">משלוח ושליחויות</option><option value="parking">חניה ונסיעות</option><option value="software">תוכנה ומנויים</option><option value="training">הדרכה / כנס</option><option value="other">אחר</option></select></label>
                <label class="field"><span>ספק / בית עסק</span><input type="text" name="general_supplier" maxlength="160"></label>
                <label class="field"><span>מספר חשבונית / קבלה</span><input type="text" name="general_invoice_number" maxlength="100"></label>
                <label class="field"><span>סכום <b>*</b></span><input type="number" name="general_amount" min="0.01" max="100000000" step="0.01" inputmode="decimal" data-required="true"></label>
                <label class="field"><span>מטבע <b>*</b></span><select name="general_currency" data-required="true"><option value="ILS">ש״ח</option><option value="USD">דולר</option><option value="EUR">אירו</option><option value="GBP">ליש״ט</option></select></label>
                <label class="field"><span>אמצעי תשלום</span><select name="general_payment_method"><option value="">בחירה</option><option value="company_card">כרטיס חברה</option><option value="private_card">כרטיס פרטי</option><option value="cash">מזומן</option><option value="bank_transfer">העברה בנקאית</option><option value="other">אחר</option></select></label>
                <label class="field"><span>פרויקט / לקוח</span><input type="text" name="general_project_customer" maxlength="160"></label>
                <label class="field field--full"><span>תיאור והערות</span><textarea name="general_description" rows="3" maxlength="2000"></textarea></label>
            </div>
        </section>

        <section class="form-card">
            <div class="form-card__header">
                <span class="step">3</span>
                <div><h2>קבלות, חשבוניות ומסמכים</h2><p>PDF או תמונה. ניתן לצרף עד 20 קבצים, עד 12MB לקובץ ועד 60MB לדיווח.</p></div>
            </div>
            <label class="upload-zone" for="attachments">
                <strong>לחצו לבחירת קבצים</strong>
                <span>קבלות, חשבוניות, כרטיסי טיסה, אישורי הזמנה ומסמכי מלון או רכב</span>
                <input id="attachments" type="file" name="attachments[]" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif">
            </label>
            <div id="selected-files" class="selected-files" aria-live="polite"></div>
            <div class="field-grid field-grid--2 upload-notes">
                <label class="field field--full"><span>הסבר למסמכים המצורפים</span><textarea name="attachment_notes" rows="2" maxlength="1000" placeholder="לדוגמה: כרטיסי טיסה, חשבונית מלון וקבלות אוכל"></textarea></label>
                <label class="check-field field--full"><input type="checkbox" id="no-receipt"><span>אין קבלה או חשבונית להוצאה זו</span></label>
                <label class="field field--full" id="no-receipt-reason-wrap" hidden><span>מדוע אין מסמך? <b>*</b></span><textarea name="no_receipt_reason" rows="2" maxlength="1000"></textarea></label>
            </div>
        </section>

        <section class="submit-bar">
            <div><strong>לפני השליחה</strong><span>ודאו שכל הסכומים והמסמכים צורפו. לאחר השליחה רק מנהל מורשה יכול לצפות בקבצים.</span></div>
            <button type="submit" class="button button--primary button--large" id="submit-report">שמירת הדיווח והמסמכים</button>
        </section>
    </form>
    <?php
}
