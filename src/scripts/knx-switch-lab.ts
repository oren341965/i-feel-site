type LabProductId = 'tc4' | 'tc5' | 'tacteo' | 'pbi';
type LabChoice = LabProductId | 'auto';

interface LabAction {
  id: string;
  stateId: string;
  label: string;
  icon: string;
  weight: number;
  customerGets: string;
  interaction: string;
  scenario?: string;
}

interface LabProduct {
  name: string;
  image: string;
  imageAlt: string;
  catalog: string;
  catalogLabel: string;
  previewClass: string;
  visibleTiles: number;
}

const LAB_ACTIONS: LabAction[] = [
  { id: 'lighting', stateId: 'lighting', label: 'תאורה מרכזית', icon: '💡', weight: 1, customerGets: 'הדלקה וכיבוי של מעגל התאורה המרכזי', interaction: 'לחיצה: הדלקה / כיבוי' },
  { id: 'dimmer', stateId: 'dimmer', label: 'תאורה בעמעום', icon: '☀️', weight: 1, customerGets: 'הדלקה ושינוי עוצמת האור', interaction: 'מסך: מחוון עוצמה · לחצן: לחיצה ארוכה' },
  { id: 'shutter', stateId: 'shutter', label: 'תריס', icon: '▤', weight: 2, customerGets: 'פתיחה, סגירה ועצירה של התריס', interaction: 'שתי פעולות: פתיחה + סגירה' },
  { id: 'curtain', stateId: 'curtain', label: 'וילון חשמלי', icon: '〰️', weight: 2, customerGets: 'פתיחה, סגירה ועצירה של הווילון', interaction: 'שתי פעולות: פתיחה + סגירה' },
  { id: 'hvac', stateId: 'hvac', label: 'מיזוג', icon: '❄️', weight: 1, customerGets: 'הפעלה, טמפרטורה ומצבים לפי התאימות', interaction: 'דף מסך ייעודי; נדרש ממשק מיזוג' },
  { id: 'heating', stateId: 'heating', label: 'חימום תת רצפתי', icon: '♨️', weight: 1, customerGets: 'הפעלה או טמפרטורה בהתאם למתאם', interaction: 'דף מסך או הפעלה פשוטה' },
  { id: 'audio', stateId: 'audio', label: 'אודיו', icon: '♫', weight: 1, customerGets: 'הפעלה וכיבוי בשלב ראשון; הרחבה רק לאחר אימות', interaction: 'דף מסך ייעודי' },
  { id: 'boiler', stateId: 'boiler', label: 'דוד', icon: '🚿', weight: 1, customerGets: 'הפעלה וכיבוי עם חיווי בהתאם לתכנון', interaction: 'לחיצה: הפעלה / כיבוי' },
  { id: 'scene-evening', stateId: 'scene', label: 'תרחיש ערב', icon: '🌙', weight: 1, customerGets: 'שילוב תאורה, תריסים ואווירה בלחיצה אחת', interaction: 'לחיצה אחת מפעילה תרחיש', scenario: 'אירוח' },
  { id: 'scene-alloff', stateId: 'scene', label: 'כיבוי כללי', icon: '⏻', weight: 1, customerGets: 'כיבוי מערכות שנבחרו ביציאה מהבית', interaction: 'לחיצה אחת; מוגדר בתכנות', scenario: 'כיבוי כללי' },
  { id: 'scene-sleep', stateId: 'scene', label: 'לילה טוב', icon: '🛏️', weight: 1, customerGets: 'כיבוי תאורה וסגירת הצללה לפי התכנון', interaction: 'לחיצה אחת ליד המיטה', scenario: 'לילה טוב' },
  { id: 'outdoor-light', stateId: 'outdoor-light', label: 'תאורת חוץ', icon: '🌿', weight: 1, customerGets: 'הדלקת תאורת גינה או מרפסת', interaction: 'לחיצה: הדלקה / כיבוי' }
];

const ACTION_BY_ID = Object.fromEntries(LAB_ACTIONS.map((action) => [action.id, action])) as Record<string, LabAction>;

const PRESETS: Record<string, { label: string; roomType: string; actions: string[] }> = {
  living: { label: 'סלון', roomType: 'living', actions: ['lighting', 'dimmer', 'shutter', 'hvac', 'scene-evening', 'scene-alloff'] },
  master: { label: 'חדר הורים', roomType: 'master', actions: ['lighting', 'dimmer', 'shutter', 'hvac', 'scene-sleep'] },
  children: { label: 'חדר ילדים', roomType: 'children', actions: ['lighting', 'shutter', 'scene-sleep'] },
  entrance: { label: 'כניסה', roomType: 'entrance', actions: ['lighting', 'scene-alloff', 'scene-evening'] },
  kitchen: { label: 'מטבח', roomType: 'kitchen', actions: ['lighting', 'dimmer', 'shutter', 'scene-evening'] },
  outdoor: { label: 'מרפסת / גינה', roomType: 'garden', actions: ['outdoor-light', 'scene-evening'] }
};

const PRODUCTS: Record<LabProductId, LabProduct> = {
  tc4: {
    name: 'מפסק KNX מסוג מסך — Siemens TC4',
    image: '/assets/knx-advisor/siemens-tc4.webp',
    imageAlt: 'מפסק KNX מסוג מסך Siemens TC4',
    catalog: '/assets/catalogs/siemens-touch-control-tc4-tc5-he.pdf#page=3',
    catalogLabel: 'למדריך TC4',
    previewClass: '',
    visibleTiles: 6
  },
  tc5: {
    name: 'מפסק KNX מסוג מסך — Siemens TC5',
    image: '/assets/knx-advisor/siemens-tc5-official.jpg',
    imageAlt: 'מפסק KNX מסוג מסך Siemens TC5',
    catalog: '/assets/catalogs/siemens-touch-control-tc4-tc5-he.pdf#page=4',
    catalogLabel: 'למדריך TC5',
    previewClass: 'is-tc5',
    visibleTiles: 8
  },
  tacteo: {
    name: 'לחצן ABB Tacteo KNX',
    image: '/assets/knx-advisor/abb-tacteo-preview.webp',
    imageAlt: 'מבחר לחצני ABB Tacteo KNX',
    catalog: '/assets/catalogs/tacteo-catalog.pdf',
    catalogLabel: 'לקטלוג Tacteo',
    previewClass: 'is-buttons',
    visibleTiles: 4
  },
  pbi: {
    name: 'מתאם KNX פנימי — Siemens PBI UP 220',
    image: '/assets/knx-advisor/siemens-pbi-up220.webp',
    imageAlt: 'מתאם KNX פנימי Siemens PBI UP 220',
    catalog: 'https://cache.industry.siemens.com/dl/files/531/109818531/att_1136419/v1/A6V10416506.pdf',
    catalogLabel: 'לדף Siemens PBI',
    previewClass: 'is-pbi',
    visibleTiles: 4
  }
};

let activePreset = 'living';
let productChoice: LabChoice = 'auto';
let selectedActions = new Set<string>(PRESETS.living.actions);

function track(event: string, detail: Record<string, unknown> = {}): void {
  const win = window as typeof window & { dataLayer?: Array<Record<string, unknown>> };
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({ event, ...detail });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
}

function selected(): LabAction[] {
  return LAB_ACTIONS.filter((action) => selectedActions.has(action.id));
}

function operationCount(): number {
  return selected().reduce((sum, action) => sum + action.weight, 0);
}

function automaticProduct(): LabProductId {
  const actions = selectedActions;
  const count = operationCount();
  if (activePreset === 'outdoor') return 'pbi';
  if (count > 8 || (['living', 'entrance'].includes(activePreset) && count >= 7)) return 'tc5';
  if (count > 4 || actions.has('hvac') || actions.has('audio') || actions.has('heating')) return 'tc4';
  return 'tacteo';
}

function activeProduct(): LabProductId {
  return productChoice === 'auto' ? automaticProduct() : productChoice;
}

function recommendationCopy(productId: LabProductId): { reason: string; advice: string } {
  const count = operationCount();
  const hasClimate = selectedActions.has('hvac') || selectedActions.has('heating');
  const hasAudio = selectedActions.has('audio');
  const automatic = automaticProduct();
  const manualPrefix = productChoice !== 'auto' && productId !== automatic
    ? `בחרתם לבדוק את המוצר הזה. ההמלצה האוטומטית למפרט הנוכחי היא ${PRODUCTS[automatic].name}. `
    : '';

  if (productId === 'pbi') {
    const model = count > 2 ? '4 ערוצים (5WG1220-2DB31)' : '2 ערוצים (5WG1220-2AB21)';
    const overflow = count > 4 ? ' יש יותר מארבע פעולות, ולכן צריך לפצל לשתי נקודות או להעביר חלק מהשליטה פנימה.' : '';
    return {
      reason: `${manualPrefix}PBI ${model} הוא מתאם KNX פנימי שמותקן מאחורי מפסק קפיצי ומחבר את הלחיצות לקו KNX. הוא אינו מפסק בפני עצמו.${overflow}`,
      advice: count > 4 ? 'אל תנסו לדחוס יותר מארבע פעולות בנקודת החוץ. השאירו במפסק המוגן מים רק תאורה ותרחיש שימושי, ואת שאר השליטה רכזו במסך פנימי.' : 'בהתקנה בחוץ יש להוסיף מפסק קפיצי מוגן מים שאותו מספק החשמלאי. ה-PBI מותקן מאחור, אינו מפסק מוגן מים ואין להסיק ממנו דרגת IP.'
    };
  }
  if (productId === 'tacteo') {
    return {
      reason: `${manualPrefix}${count} פעולות יומיומיות יכולות להיות גלויות ונגישות על לחצן KNX ללא מעבר בין מסכים. מספר הערוצים והפריסה המדויקים ייבחרו לפי התוכן והגמר.`,
      advice: hasClimate || hasAudio ? 'אם רוצים שינוי טמפרטורה, מצבים או שליטת אודיו מפורטת, מסך יהיה ברור וגמיש יותר. אפשר להשאיר לחצן ליד המיטה ולהוסיף מסך בכניסה.' : 'בחדר פשוט עדיף לא להעמיס. תאורה, תריס ותרחיש אחד הם סט פעולות ברור שקל לזכור גם בחושך.'
    };
  }
  if (productId === 'tc5') {
    return {
      reason: `${manualPrefix}מפסק KNX מסוג מסך TC5 מתאים כאשר רוצים לראות יותר מידע ופעולות בכל מסך, או כאשר זהו אזור מרכזי עם ריבוי מערכות. הוא מציע מסך 5 אינץ׳ ועד 15 דפי פונקציה המוגדרים ב-ETS.`,
      advice: count <= 5 && !hasClimate && !hasAudio ? 'למפרט קטן TC5 עלול להיות גדול מהנדרש. בדקו אם TC4 או לחצן KNX יתנו חוויה פשוטה וחסכונית יותר במקום הזה.' : 'רכזו במסך הבית רק את 4-6 הפעולות היומיומיות. פעולות נדירות יותר כדאי להעביר לדפים נוספים כדי שהמסך הראשי יישאר ברור.'
    };
  }
  return {
    reason: `${manualPrefix}מפסק KNX מסוג מסך TC4 מרכז ${count} פעולות בממשק קומפקטי. הוא מתאים במיוחד כאשר יש מיזוג, אודיו או צורך לשנות את תוכן המפסק בעתיד.`,
    advice: count > 8 ? 'יש כאן הרבה תוכן למסך קומפקטי. שקלו TC5 כדי להפחית מעבר בין דפים, או פצלו בין מסך בכניסה ללחצן פשוט בנקודה נוספת.' : 'הציגו במסך הראשון את הפעולות היומיומיות, והעבירו תרחישים או מידע משני לדפים נוספים. כך המשתמש לא מחפש פעולה בסיסית.'
  };
}

function renderActionButtons(): void {
  const root = document.querySelector<HTMLElement>('#lab-actions');
  if (!root) return;
  root.innerHTML = LAB_ACTIONS.map((action) => `
    <button class="advisor-lab-action" type="button" data-lab-action="${action.id}" aria-pressed="${selectedActions.has(action.id)}">
      <span aria-hidden="true">${action.icon}</span><strong>${escapeHtml(action.label)}</strong><small>${escapeHtml(action.customerGets)}</small>
    </button>`).join('');
  root.querySelectorAll<HTMLButtonElement>('[data-lab-action]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.labAction || '';
    if (selectedActions.has(id)) selectedActions.delete(id); else selectedActions.add(id);
    renderActionButtons();
    renderLab();
    track('advisor_lab_action_changed', { action: id, selected: selectedActions.has(id) });
  }));
}

function screenPreview(productId: 'tc4' | 'tc5', actions: LabAction[]): string {
  const visible = actions.slice(0, PRODUCTS[productId].visibleTiles);
  const extra = Math.max(0, actions.length - visible.length);
  return `
    <div class="advisor-device-screen-head"><span>SIEMENS</span><span>20.5° · ${activePreset === 'living' ? 'סלון' : PRESETS[activePreset].label}</span></div>
    <div class="advisor-device-screen-grid">
      ${visible.map((action) => `<div class="advisor-device-screen-tile"><span aria-hidden="true">${action.icon}</span><small>${escapeHtml(action.label)}</small></div>`).join('') || '<div class="advisor-device-screen-tile"><small>בחרו פעולה</small></div>'}
    </div>
    ${extra ? `<div class="advisor-device-screen-more">ועוד ${extra} פעולות בדפים נוספים</div>` : '<div class="advisor-device-screen-more">התוכן והאייקונים מוגדרים בפרויקט ETS</div>'}`;
}

function buttonSlots(actions: LabAction[]): Array<{ icon: string; label: string }> {
  return actions.flatMap((action) => action.weight === 2
    ? [{ icon: action.icon, label: `${action.label} פתיחה` }, { icon: action.icon, label: `${action.label} סגירה` }]
    : [{ icon: action.icon, label: action.label }]);
}

function buttonPreview(actions: LabAction[]): string {
  const visible = buttonSlots(actions).slice(0, 4);
  return `<div class="advisor-device-button-grid">${visible.map((slot) => `<div class="advisor-device-button"><span aria-hidden="true">${slot.icon}</span><small>${escapeHtml(slot.label)}</small></div>`).join('') || '<div class="advisor-device-button"><small>בחרו פעולה</small></div>'}</div>`;
}

function pbiPreview(actions: LabAction[]): string {
  const slots = Math.min(4, Math.max(2, operationCount() > 2 ? 4 : 2));
  const previewSlots = buttonSlots(actions);
  return `<div class="advisor-pbi-diagram"><div class="advisor-pbi-face">${Array.from({ length: slots }, (_, index) => `<span title="${escapeHtml(previewSlots[index]?.label || `לחצן ${index + 1}`)}">${previewSlots[index]?.icon || index + 1}</span>`).join('')}</div><div class="advisor-pbi-arrow" aria-hidden="true">←</div><div class="advisor-pbi-module">Siemens<br />PBI<br /><small>מאחורי המפסק</small></div></div>`;
}

function contentList(productId: LabProductId, actions: LabAction[]): string {
  if (!actions.length) return '<li><span>＋</span><div><strong>עדיין לא נבחר תוכן</strong><small>בחרו פעולה בצד ימין</small></div></li>';
  let slot = 1;
  return actions.map((action) => {
    const placement = productId === 'tc4' || productId === 'tc5'
      ? `אריח / דף ${slot++}`
      : action.weight === 2 ? `לחצנים ${slot}-${slot + 1}` : `לחצן ${slot}`;
    if (productId !== 'tc4' && productId !== 'tc5') slot += action.weight;
    return `<li><span aria-hidden="true">${action.icon}</span><div><strong>${escapeHtml(action.label)}</strong><small>${escapeHtml(action.customerGets)}</small></div><em>${escapeHtml(placement)} · ${escapeHtml(action.interaction)}</em></li>`;
  }).join('');
}

function renderLab(): void {
  const productId = activeProduct();
  const product = PRODUCTS[productId];
  const actions = selected();
  const count = operationCount();
  const copy = recommendationCopy(productId);
  const productName = document.querySelector<HTMLElement>('#lab-product-name');
  const countElement = document.querySelector<HTMLElement>('#lab-operation-count');
  const photo = document.querySelector<HTMLImageElement>('#lab-product-photo');
  const preview = document.querySelector<HTMLElement>('#lab-device-preview');
  const list = document.querySelector<HTMLElement>('#lab-content-list');
  const reason = document.querySelector<HTMLElement>('#lab-reason');
  const advice = document.querySelector<HTMLElement>('#lab-advice');
  const catalog = document.querySelector<HTMLAnchorElement>('#lab-catalog-link');
  if (!productName || !countElement || !photo || !preview || !list || !reason || !advice || !catalog) return;

  productName.textContent = product.name;
  countElement.textContent = `${count} ${count === 1 ? 'פעולה' : 'פעולות'}`;
  photo.src = product.image;
  photo.alt = product.imageAlt;
  preview.className = `advisor-live-device ${product.previewClass}`.trim();
  preview.innerHTML = productId === 'tc4' || productId === 'tc5' ? screenPreview(productId, actions) : productId === 'tacteo' ? buttonPreview(actions) : pbiPreview(actions);
  list.innerHTML = contentList(productId, actions);
  reason.innerHTML = `<strong>למה זה מתאים?</strong> ${escapeHtml(copy.reason)}`;
  advice.textContent = copy.advice;
  catalog.href = product.catalog;
  catalog.textContent = product.catalogLabel;
}

function selectPreset(id: string): void {
  if (!PRESETS[id]) return;
  activePreset = id;
  selectedActions = new Set(PRESETS[id].actions);
  document.querySelectorAll<HTMLButtonElement>('[data-lab-preset]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.labPreset === id)));
  renderActionButtons();
  renderLab();
}

function selectProduct(choice: LabChoice): void {
  productChoice = choice;
  document.querySelectorAll<HTMLButtonElement>('[data-lab-product-choice]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.labProductChoice === choice)));
  renderLab();
}

function builderPayload(): Record<string, unknown> {
  const actions: Record<string, number> = {};
  const scenarios: string[] = [];
  selected().forEach((action) => {
    actions[action.stateId] = (actions[action.stateId] || 0) + 1;
    if (action.scenario) scenarios.push(action.scenario);
  });
  return {
    roomType: PRESETS[activePreset].roomType,
    roomName: PRESETS[activePreset].label,
    actions,
    scenarios,
    acType: selectedActions.has('hvac') ? 'unknown' : 'none',
    floorHeating: selectedActions.has('heating') ? 'unknown' : 'none',
    exterior: activePreset === 'outdoor',
    preferredProduct: activeProduct()
  };
}

function initLab(): void {
  const lab = document.querySelector<HTMLElement>('#switch-lab');
  if (!lab) return;
  document.querySelectorAll<HTMLButtonElement>('[data-lab-preset]').forEach((button) => button.addEventListener('click', () => {
    selectPreset(button.dataset.labPreset || 'living');
    track('advisor_lab_preset_selected', { preset: activePreset });
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-lab-product-choice]').forEach((button) => button.addEventListener('click', () => {
    selectProduct((button.dataset.labProductChoice || 'auto') as LabChoice);
    track('advisor_lab_product_selected', { product: productChoice });
  }));
  document.querySelectorAll<HTMLAnchorElement>('[data-lab-product]').forEach((link) => link.addEventListener('click', () => {
    selectProduct((link.dataset.labProduct || 'auto') as LabChoice);
  }));
  document.querySelector<HTMLButtonElement>('#lab-use-in-advisor')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('advisor:use-builder', { detail: builderPayload() }));
    track('advisor_lab_applied', { preset: activePreset, product: activeProduct(), operations: operationCount() });
  });
  renderActionButtons();
  renderLab();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLab, { once: true });
  else initLab();
}

export { LAB_ACTIONS, PRESETS, PRODUCTS, automaticProduct, operationCount };
