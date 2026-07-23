type StringMap = Record<string, string>;
type NumberMap = Record<string, number>;

interface ProjectState {
  property: string;
  work: string;
  scope: string;
  floors: number;
  plans: string[];
}

interface DesignState {
  style: string;
  interface: string;
  material: string;
  color: string;
  labels: string;
  flushLine: string;
  wallType: string;
  wallFinished: string;
}

interface RoomState {
  id: string;
  name: string;
  type: string;
  floor: number;
  size: number;
  users: number;
  bedSides: number;
  features: string[];
  acType: string;
  acControl: string;
  thermostat: string;
  floorHeating: string;
  preferredProduct?: string;
  actions: NumberMap;
  scenarios: string[];
}

interface AdvisorState {
  version: number;
  mode: string;
  step: number;
  currentRoom: number;
  project: ProjectState;
  design: DesignState;
  rooms: RoomState[];
  updatedAt: string;
}

interface BuilderSelection {
  roomType: string;
  roomName: string;
  actions: NumberMap;
  scenarios: string[];
  acType: string;
  floorHeating: string;
  exterior: boolean;
  preferredProduct: string;
}

interface PositionRecommendation {
  room: RoomState;
  location: string;
  operations: number;
  systems: string[];
  exterior: boolean;
  family: string;
  manufacturer: string;
  model: string;
  reason: string;
  advantages: string;
  limitations: string;
  verify: string;
  alternatives: Array<{ title: string; copy: string }>;
  electricianNote: string;
  hvacNote: string;
}

const STORAGE_KEY = 'ifeel-knx-advisor-v1';
const TOTAL_STEPS = 5;

const ROOM_TYPES: StringMap = {
  entrance: 'כניסה', living: 'סלון', kitchen: 'מטבח', dining: 'פינת אוכל', corridor: 'מסדרון',
  master: 'חדר הורים', children: 'חדר ילדים', bedroom: 'חדר שינה', office: 'משרד', bathroom: 'רחצה ושירותים',
  'guest-toilet': 'שירותי אורחים', wardrobe: 'חדר ארונות', 'safe-room': 'ממ״ד', cinema: 'קולנוע',
  basement: 'מרתף', balcony: 'מרפסת', garden: 'גינה', pool: 'בריכה', pergola: 'פרגולה', service: 'שירות', other: 'אחר'
};

const MODE_LABELS: StringMap = {
  'whole-home': 'תכנון בית שלם', floor: 'תכנון קומה', room: 'פתרון לחדר אחד',
  'existing-list': 'מיפוי רשימת מפסקים', upgrade: 'שדרוג KNX קיים', guided: 'תכנון מודרך'
};

const PROPERTY_LABELS: StringMap = {
  'private-home': 'בית פרטי', apartment: 'דירה', penthouse: 'פנטהאוז', office: 'משרד', hotel: 'מלון', public: 'מבנה ציבור', other: 'אחר'
};

const WORK_LABELS: StringMap = {
  new: 'בנייה חדשה', renovation: 'שיפוץ עמוק', upgrade: 'שדרוג KNX קיים', 'switch-replacement': 'החלפת מפסקים', undecided: 'טרם הוחלט'
};

const ACTIONS = [
  { id: 'lighting', label: 'תאורה רגילה', icon: '💡', weight: 1 },
  { id: 'dimmer', label: 'דימר', icon: '☀️', weight: 1 },
  { id: 'shutter', label: 'תריס', icon: '▤', weight: 2 },
  { id: 'curtain', label: 'וילון', icon: '〰️', weight: 2 },
  { id: 'blind24', label: 'צלון כלוא 24V', icon: '↕️', weight: 2 },
  { id: 'hvac', label: 'מיזוג', icon: '❄️', weight: 1 },
  { id: 'heating', label: 'חימום תת רצפתי', icon: '♨️', weight: 1 },
  { id: 'boiler', label: 'דוד', icon: '🚿', weight: 1 },
  { id: 'vent', label: 'ונטה', icon: '🌀', weight: 1 },
  { id: 'fan', label: 'מאוורר', icon: '🌬️', weight: 1 },
  { id: 'audio', label: 'אודיו', icon: '♫', weight: 1 },
  { id: 'scene', label: 'תרחיש', icon: '✨', weight: 1 },
  { id: 'pergola', label: 'פרגולה', icon: '☂️', weight: 1 },
  { id: 'outdoor-light', label: 'תאורת חוץ', icon: '🌙', weight: 1 },
  { id: 'pool-light', label: 'תאורת בריכה', icon: '🏊', weight: 1 },
  { id: 'pump', label: 'משאבה', icon: '⚙️', weight: 1 },
  { id: 'other', label: 'פעולה אחרת', icon: '＋', weight: 1 }
] as const;

const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((action) => [action.id, action]));

const SCENARIOS = ['כיבוי כללי', 'יציאה', 'כניסה', 'לילה טוב', 'בוקר טוב', 'אירוח', 'קולנוע', 'שבת', 'ניקיון', 'חופשה', 'סגירת תריסים', 'כיבוי קומה', 'כיבוי חדר'];
const BEDROOM_TYPES = new Set(['master', 'children', 'bedroom']);
const PUBLIC_TYPES = new Set(['entrance', 'living', 'kitchen', 'dining', 'office', 'cinema', 'basement']);
const EXTERIOR_TYPES = new Set(['balcony', 'garden', 'pool', 'pergola']);

const PRODUCT_RESOURCES = {
  tc4: { image: '/assets/knx-advisor/siemens-tc4.webp', alt: 'Siemens Touch Control TC4', catalog: '/assets/catalogs/siemens-touch-control-tc4-tc5-he.pdf#page=3', catalogLabel: 'מדריך TC4' },
  tc5: { image: '/assets/knx-advisor/siemens-tc5.webp', alt: 'Siemens Touch Control TC5', catalog: '/assets/catalogs/siemens-touch-control-tc4-tc5-he.pdf#page=4', catalogLabel: 'מדריך TC5' },
  tacteo: { image: '/assets/knx-advisor/abb-tacteo-preview.webp', alt: 'דוגמאות לחצני ABB Tacteo KNX', catalog: '/assets/catalogs/tacteo-catalog.pdf', catalogLabel: 'קטלוג לחצני KNX' },
  pbi: { image: '/assets/knx-advisor/siemens-pbi-up220.webp', alt: 'Siemens Push Button Interface UP 220', catalog: 'https://cache.industry.siemens.com/dl/files/531/109818531/att_1136419/v1/A6V10416506.pdf', catalogLabel: 'דף Siemens PBI' }
} as const;

function createRoom(index = 0, type = 'living'): RoomState {
  const isBedroom = BEDROOM_TYPES.has(type);
  return {
    id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: index === 0 ? ROOM_TYPES[type] : `${ROOM_TYPES[type]} ${index + 1}`,
    type,
    floor: 1,
    size: isBedroom ? 16 : 28,
    users: isBedroom ? 2 : 1,
    bedSides: isBedroom ? 2 : 0,
    features: type === 'children' ? ['child'] : [],
    acType: 'unknown',
    acControl: 'on-off',
    thermostat: 'unknown',
    floorHeating: 'none',
    preferredProduct: '',
    actions: { lighting: 1, scene: 1 },
    scenarios: type === 'entrance' ? ['כיבוי כללי', 'יציאה', 'כניסה', 'אירוח'] : ['כיבוי חדר']
  };
}

function initialState(mode = ''): AdvisorState {
  const type = mode === 'room' ? 'bedroom' : 'living';
  return {
    version: 1,
    mode,
    step: 1,
    currentRoom: 0,
    project: {
      property: 'private-home',
      work: mode === 'upgrade' ? 'upgrade' : 'new',
      scope: mode === 'room' ? 'room' : mode === 'floor' ? 'floor' : mode === 'existing-list' ? 'existing-list' : 'whole-home',
      floors: 1,
      plans: []
    },
    design: { style: 'modern', interface: 'mixed', material: 'glass', color: 'white', labels: 'icons', flushLine: 'no', wallType: 'plaster', wallFinished: 'not-finished' },
    rooms: [createRoom(0, type)],
    updatedAt: new Date().toISOString()
  };
}

let state = initialState();
let lastRecommendations: PositionRecommendation[] = [];

function qs<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function qsa<T extends Element>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
}

function track(event: string, detail: Record<string, unknown> = {}): void {
  const win = window as typeof window & { dataLayer?: Array<Record<string, unknown>> };
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({ event, ...detail });
}

function currentRoom(): RoomState {
  if (!state.rooms[state.currentRoom]) state.currentRoom = 0;
  return state.rooms[state.currentRoom];
}

function saveState(announce = true): void {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (announce) {
    const label = document.querySelector<HTMLElement>('#advisor-draft-state');
    if (label) label.textContent = '● הטיוטה נשמרה';
  }
}

function loadSavedState(): AdvisorState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdvisorState;
    if (parsed.version !== 1 || !Array.isArray(parsed.rooms) || !parsed.rooms.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setSelectValue(id: string, value: string | number): void {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (element) element.value = String(value);
}

function restoreStaticFields(): void {
  setSelectValue('property-type', state.project.property);
  setSelectValue('work-type', state.project.work);
  setSelectValue('project-scope', state.project.scope);
  setSelectValue('floor-count', state.project.floors);
  qsa<HTMLInputElement>('[data-plan]').forEach((input) => { input.checked = state.project.plans.includes(input.value); });
  Object.entries(state.design).forEach(([key, value]) => {
    const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-design="${key}"]`);
    if (input) input.value = String(value);
  });
}

function syncProjectAndDesign(): void {
  qsa<HTMLInputElement | HTMLSelectElement>('[data-project]').forEach((input) => {
    const key = input.dataset.project as keyof ProjectState;
    if (key === 'floors') state.project.floors = Math.max(1, Number(input.value) || 1);
    else (state.project[key] as string) = input.value;
  });
  state.project.plans = qsa<HTMLInputElement>('[data-plan]:checked').map((input) => input.value);
  qsa<HTMLInputElement | HTMLSelectElement>('[data-design]').forEach((input) => {
    const key = input.dataset.design as keyof DesignState;
    state.design[key] = input.value;
  });
}

function renderProgress(): void {
  qsa<HTMLElement>('[data-step]').forEach((panel) => { panel.hidden = Number(panel.dataset.step) !== state.step; });
  qs<HTMLElement>('#advisor-step-label').textContent = `שלב ${state.step} מתוך ${TOTAL_STEPS}`;
  const progress = qs<HTMLElement>('#advisor-progress-bar');
  progress.style.width = `${(state.step / TOTAL_STEPS) * 100}%`;
  const track = progress.parentElement;
  track?.setAttribute('aria-valuenow', String(state.step));
  qs<HTMLButtonElement>('#previous-step').hidden = state.step === 1;
  qs<HTMLButtonElement>('#next-step').hidden = state.step === TOTAL_STEPS;
  qs<HTMLButtonElement>('#show-results').hidden = state.step !== TOTAL_STEPS;
  if (state.step === 5) updateReview();
}

function renderRoomList(): void {
  const lists = [qs<HTMLElement>('#room-list'), qs<HTMLElement>('#system-room-list')];
  lists.forEach((list) => {
    list.innerHTML = state.rooms.map((room, index) => `
      <button type="button" class="advisor-room-tab" data-room-index="${index}" role="tab" aria-selected="${index === state.currentRoom}">
        <span><strong>${escapeHtml(room.name || ROOM_TYPES[room.type])}</strong><small>קומה ${escapeHtml(room.floor)}</small></span><span aria-hidden="true">${index === state.currentRoom ? '●' : '○'}</span>
      </button>`).join('');
    qsa<HTMLButtonElement>('[data-room-index]', list).forEach((button) => {
      button.addEventListener('click', () => {
        syncRoomEditor();
        state.currentRoom = Number(button.dataset.roomIndex);
        renderRoomList();
        renderRoomEditor();
        renderSystems();
        saveState(false);
      });
    });
  });
}

function renderRoomEditor(): void {
  const room = currentRoom();
  setSelectValue('room-name', room.name);
  setSelectValue('room-type', room.type);
  setSelectValue('room-floor', room.floor);
  setSelectValue('room-size', room.size);
  setSelectValue('room-users', room.users);
  setSelectValue('room-bed-sides', room.bedSides);
  qsa<HTMLInputElement>('#room-feature-grid input').forEach((input) => { input.checked = room.features.includes(input.value); });
  qs<HTMLButtonElement>('#delete-room').disabled = state.rooms.length === 1;
}

function syncRoomEditor(): void {
  const room = currentRoom();
  room.name = qs<HTMLInputElement>('#room-name').value.trim() || ROOM_TYPES[qs<HTMLSelectElement>('#room-type').value];
  room.type = qs<HTMLSelectElement>('#room-type').value;
  room.floor = Number(qs<HTMLInputElement>('#room-floor').value) || 1;
  room.size = Math.max(1, Number(qs<HTMLInputElement>('#room-size').value) || 1);
  room.users = Math.max(0, Number(qs<HTMLInputElement>('#room-users').value) || 0);
  room.bedSides = Number(qs<HTMLSelectElement>('#room-bed-sides').value) || 0;
  room.features = qsa<HTMLInputElement>('#room-feature-grid input:checked').map((input) => input.value);
}

function renderSystems(): void {
  const room = currentRoom();
  setSelectValue('ac-type', room.acType);
  setSelectValue('ac-control', room.acControl);
  setSelectValue('thermostat-choice', room.thermostat);
  setSelectValue('floor-heating', room.floorHeating);
  renderActions();
  renderScenarios();
  renderRoomCoach();
}

function renderActions(): void {
  const room = currentRoom();
  const grid = qs<HTMLElement>('#actions-grid');
  grid.innerHTML = ACTIONS.map((action) => {
    const count = room.actions[action.id] || 0;
    return `<div class="advisor-action-card ${count ? 'is-active' : ''}" data-action-card="${action.id}">
      <label class="advisor-action-top"><input type="checkbox" data-action-check="${action.id}" ${count ? 'checked' : ''} /><span aria-hidden="true">${action.icon}</span><strong>${action.label}</strong></label>
      <div class="advisor-counter" ${count ? '' : 'hidden'}><button type="button" data-action-minus="${action.id}" aria-label="הפחתת ${action.label}">−</button><output aria-label="כמות ${action.label}">${Math.max(1, count)}</output><button type="button" data-action-plus="${action.id}" aria-label="הוספת ${action.label}">＋</button></div>
    </div>`;
  }).join('');

  qsa<HTMLInputElement>('[data-action-check]', grid).forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.actionCheck || '';
      if (input.checked) room.actions[id] = Math.max(1, room.actions[id] || 1);
      else delete room.actions[id];
      if (id === 'audio' && input.checked) track('advisor_audio_selected', { room_type: room.type });
      renderActions();
      renderRoomCoach();
      saveState();
    });
  });
  qsa<HTMLButtonElement>('[data-action-minus]', grid).forEach((button) => button.addEventListener('click', () => changeActionCount(button.dataset.actionMinus || '', -1)));
  qsa<HTMLButtonElement>('[data-action-plus]', grid).forEach((button) => button.addEventListener('click', () => changeActionCount(button.dataset.actionPlus || '', 1)));
}

function changeActionCount(id: string, delta: number): void {
  const room = currentRoom();
  room.actions[id] = Math.min(20, Math.max(1, (room.actions[id] || 1) + delta));
  renderActions();
  renderRoomCoach();
  saveState();
}

function renderScenarios(): void {
  const room = currentRoom();
  const grid = qs<HTMLElement>('#scenario-grid');
  grid.innerHTML = SCENARIOS.map((scenario) => `<label class="advisor-check"><input type="checkbox" value="${scenario}" ${room.scenarios.includes(scenario) ? 'checked' : ''} />${scenario}</label>`).join('');
  qsa<HTMLInputElement>('input', grid).forEach((input) => input.addEventListener('change', () => {
    room.scenarios = qsa<HTMLInputElement>('input:checked', grid).map((item) => item.value);
    room.actions.scene = Math.max(1, room.scenarios.length || 0);
    if (!room.scenarios.length) delete room.actions.scene;
    renderRoomCoach();
    saveState();
  }));
}

function syncSystems(): void {
  const room = currentRoom();
  room.acType = qs<HTMLSelectElement>('#ac-type').value;
  room.acControl = qs<HTMLSelectElement>('#ac-control').value;
  room.thermostat = qs<HTMLSelectElement>('#thermostat-choice').value;
  room.floorHeating = qs<HTMLSelectElement>('#floor-heating').value;
  if (room.acType !== 'none') room.actions.hvac = Math.max(1, room.actions.hvac || 1); else delete room.actions.hvac;
  if (room.floorHeating !== 'none') room.actions.heating = Math.max(1, room.actions.heating || 1); else delete room.actions.heating;
}

function actionTotal(room: RoomState, subset?: string[]): number {
  const ids = subset || Object.keys(room.actions);
  return ids.reduce((sum, id) => sum + (room.actions[id] || 0) * (ACTION_BY_ID[id as keyof typeof ACTION_BY_ID]?.weight || 1), 0);
}

function actionLabels(room: RoomState): string[] {
  return Object.keys(room.actions).filter((id) => room.actions[id] > 0).map((id) => ACTION_BY_ID[id as keyof typeof ACTION_BY_ID]?.label || id);
}

function positionsForRoom(room: RoomState): Array<{ location: string; operations: number; exterior: boolean }> {
  const total = Math.max(1, actionTotal(room));
  const exterior = EXTERIOR_TYPES.has(room.type) || room.features.includes('exposed');
  if (exterior) {
    const result = [{ location: 'נקודת הפעלה חיצונית מוגנת', operations: Math.min(total, 4), exterior: true }];
    if (total > 4) result.push({ location: 'נקודת שליטה פנימית סמוכה', operations: total, exterior: false });
    return result;
  }

  const positions: Array<{ location: string; operations: number; exterior: boolean }> = [];
  const mainLocation = room.type === 'bathroom' || room.type === 'guest-toilet' ? 'בכניסה, מחוץ לאזור הרטוב' : room.type === 'entrance' ? 'בכניסה הראשית' : 'בכניסה לחדר';
  positions.push({ location: mainLocation, operations: total, exterior: false });

  if (BEDROOM_TYPES.has(room.type)) {
    const bedsideOps = Math.max(1, Math.min(4, actionTotal(room, ['lighting', 'dimmer', 'shutter', 'curtain', 'scene'])));
    if (room.bedSides >= 1) positions.push({ location: 'ליד צד ראשון של המיטה', operations: bedsideOps, exterior: false });
    if (room.bedSides >= 2) positions.push({ location: 'ליד צד שני של המיטה', operations: bedsideOps, exterior: false });
  }
  if (room.type === 'master') {
    if (room.features.includes('wardrobe')) positions.push({ location: 'בכניסה לחדר הארונות', operations: Math.min(2, total), exterior: false });
    if (room.features.includes('bathroom')) positions.push({ location: 'מחוץ לאזור הרטוב ברחצה הצמודה', operations: Math.min(3, total), exterior: false });
    if (room.features.includes('balcony')) positions.push({ location: 'ליד היציאה למרפסת, בצד הפנימי', operations: Math.min(4, total), exterior: false });
  }
  if (room.size >= 35 && positions.length === 1) positions.push({ location: 'נקודה נוספת באזור השימוש המרכזי', operations: Math.min(4, total), exterior: false });
  return positions;
}

function needsScreen(room: RoomState, operations: number): boolean {
  return room.acType === 'vrf' || Boolean(room.actions.audio) || operations >= 5 || state.design.interface === 'screen' || state.design.labels === 'dynamic';
}

function recommend(room: RoomState, location: string, operations: number, exterior: boolean): PositionRecommendation {
  const systems = actionLabels(room);
  const isBedside = location.includes('המיטה');
  const preferred = isBedside ? '' : (room.preferredProduct || '');
  let family = '';
  let manufacturer = 'Siemens';
  let model = '';
  let reason = '';
  let advantages = '';
  let limitations = '';
  let verify = '';
  let alternatives: Array<{ title: string; copy: string }> = [];

  if (exterior || preferred === 'pbi') {
    const fourButton = operations > 2;
    family = fourButton ? 'PBI 4 לחצנים' : 'PBI 2 לחצנים';
    model = fourButton ? '5WG1220-2DB31' : '5WG1220-2AB21';
    reason = exterior ? `נקודת חוץ עם ${operations} פעולות דורשת מתאם פנימי ומפסק קפיצי חיצוני מוגן מים.` : `נבחר מתאם PBI כדי לחבר ל-KNX מפסק קפיצי רגיל עם ${operations} פעולות.`;
    advantages = exterior ? 'פתרון KNX מתאים לנקודה חיצונית בלי להציב מסך פנימי באזור חשוף.' : 'מאפשר לשמור חזית מסדרת חשמל רגילה ולהעביר את הלחיצות ל-KNX.';
    limitations = 'PBI הוא מתאם בלבד ואינו מפסק מוגן מים. מעל ארבע פעולות יש לפצל או להעביר פעולות לנקודה פנימית.';
    verify = 'המפסק החיצוני, דרגת האטימות, הקופסה, העומק והכבילה מול החשמלאי.';
    alternatives = operations > 4 ? [{ title: 'פיצול לשני מפסקים חיצוניים', copy: 'נדרש כאשר חייבים יותר מארבע פעולות בחוץ.' }] : [];
  } else if (preferred === 'tacteo' || (isBedside && (room.type === 'children' || room.features.includes('child')))) {
    family = 'לחצן KNX';
    manufacturer = preferred === 'tacteo' ? 'ABB' : 'לבחירה לפי דגם';
    model = preferred === 'tacteo' ? 'ABB Tacteo KNX' : 'לחצן פשוט ועמיד';
    reason = preferred === 'tacteo' ? `${operations} פעולות יומיומיות יכולות להישאר גלויות ונגישות בלי מעבר בין מסכים.` : 'ליד מיטת ילד עדיפים מעט פעולות ותרחישים ברורים.';
    advantages = 'שימוש ישיר, עמיד ופשוט בלילה.';
    limitations = 'אייקון קבוע מגביל את הגמישות העיצובית לאחר שינוי פעולות.';
    verify = 'דגם מדויק, מספר לחצנים, קופסה, גמר ואייקונים.';
    alternatives = [{ title: 'Eelectron או MDT', copy: 'חלופת לחצנים שיש לבחור לפי מספר הפעולות והגמר.' }];
  } else if (preferred === 'tc5' || (preferred !== 'tc4' && (operations > 8 || (PUBLIC_TYPES.has(room.type) && operations >= 7)))) {
    family = 'TC5';
    model = 'Siemens Touch Control TC5';
    reason = preferred === 'tc5' ? `TC5 נבחר כדי להציג ${operations} פעולות עם יותר שטח ומידע גלוי.` : `${operations} פעולות באזור ${PUBLIC_TYPES.has(room.type) ? 'מרכזי' : 'עמוס'} מצדיקות שטח מסך גדול יותר.`;
    advantages = 'מסך 5 אינץ׳, יותר מידע ופעולות בכל מסך וגמישות גבוהה לשינויים.';
    limitations = 'דורש תכנון הזנה, קופסה ותכנות; ההתאמה לכל מערכת נבדקת בנפרד.';
    verify = 'דגם מדויק, אוריינטציה, קופסת התקנה, הזנה ותאימות מיזוג.';
    alternatives = [{ title: 'מסך KNX של Eelectron או MDT', copy: 'חלופה אפשרית לאחר אימות פונקציות, מידות וקופסה.' }];
  } else if (preferred === 'tc4' || needsScreen(room, operations)) {
    family = 'TC4';
    model = 'Siemens Touch Control TC4';
    reason = preferred === 'tc4' ? `TC4 נבחר כדי לרכז ${operations} פעולות בממשק קומפקטי ודינמי.` : room.acType === 'vrf' ? 'VRF דורש ממשק מסך ותיאום מתאם תקשורת, גם כאשר מספר הפעולות קטן.' : room.actions.audio ? 'אודיו מוגדר במסך ייעודי ולכן נדרש TC4 או TC5.' : `${operations} פעולות מתאימות למסך קומפקטי ודינמי.`;
    advantages = 'מסך 4 אינץ׳ קומפקטי לשליטה מרוכזת ולשינוי עתידי של תצוגות ותרחישים.';
    limitations = 'מציג פחות מידע בכל מסך לעומת TC5 ולכן דורש יותר מעבר בין מסכים.';
    verify = 'דגם מדויק, קופסה, הזנה, תצורת ETS ותאימות למיזוג או לחימום.';
    alternatives = operations >= 7 ? [{ title: 'Siemens TC5', copy: 'חלופה עם שטח מסך גדול יותר כאשר רוצים פחות מעבר בין מסכים.' }] : [{ title: 'מסך KNX של Eelectron או MDT', copy: 'חלופה אפשרית לאחר אימות פונקציות, מידות וקופסה.' }];
  } else {
    family = 'לחצן KNX';
    manufacturer = 'לבחירה לפי הגמר';
    model = 'לחצן KNX מותאם למספר הפעולות';
    reason = `${operations} פעולות מתאימות בדרך כלל למפסק לחצנים ישיר.`;
    advantages = 'הפעלה מהירה, ברורה וגמישות תכנותית גבוהה.';
    limitations = 'אייקונים קבועים מגבילים את השינוי העיצובי אם מחליפים תפקידים בעתיד.';
    verify = 'דגם מדויק, מספר לחצנים, קופסה, גמר ואפשרויות סימון.';
    alternatives = [{ title: 'Eelectron או MDT', copy: 'חלופת לחצנים בהתאם לכמות הפעולות ולשפה העיצובית.' }];
  }

  const decorative = state.design.color === 'custom' || ['glass', 'metal'].includes(state.design.material);
  if (decorative && !exterior && alternatives.length < 2) {
    alternatives.push({ title: 'ABB TACTEO או ABB PEONIA', copy: 'חלופה עיצובית לצבעים וגמרים; יש לאמת דגם, פעולות וקופסה.' });
  }
  if (family === 'לחצן KNX' && !decorative && alternatives.length < 2 && operations >= 3) {
    alternatives.push({ title: 'Schneider Electric System M או ABB', copy: 'ב‑System M בוחרים לחצן פיזי של 2, 4 או 8 פעולות, בלבן או באנתרציט, לאחר התאמת המסגרת והסימון.' });
  }
  alternatives = alternatives.slice(0, 2);

  const electricianNote = exterior
    ? 'המפסק הקפיצי החיצוני המוגן מים יסופק על ידי החשמלאי. יש לתאם מראש את הקופסה, עומק ההתקנה, הכבילה והמקום למתאם PBI.'
    : family.startsWith('PBI') ? 'לתאם קופסה עמוקה, מפסק קפיצי, קו KNX ומקום למתאם PBI מאחורי החזית.'
      : family.startsWith('TC') ? 'לתאם קופסה, עומק, KNX והזנת עזר לפני סגירת הקיר.' : 'לתאם קופסה, קו KNX, מספר לחצנים וסימון לפני ההזמנה.';
  const hvacNote = room.acType === 'vrf' ? 'נדרש מתאם תקשורת. CoolMaster KNX מועדף בדרך כלל, והמתאם צריך להגיע בתיאום עם איש המיזוג.' : room.acType !== 'none' ? 'יש לאמת את סוג הממשק ורמת השליטה מול איש המיזוג.' : 'ללא דרישת מיזוג שהוגדרה.';

  return { room, location, operations, systems, exterior, family, manufacturer, model, reason, advantages, limitations, verify, alternatives, electricianNote, hvacNote };
}

function buildRecommendations(): PositionRecommendation[] {
  return state.rooms.flatMap((room) => positionsForRoom(room).map((position) => recommend(room, position.location, position.operations, position.exterior)));
}

function updateReview(): void {
  syncProjectAndDesign();
  syncRoomEditor();
  syncSystems();
  const points = state.rooms.reduce((sum, room) => sum + positionsForRoom(room).length, 0);
  qs<HTMLElement>('#review-title').textContent = `${state.rooms.length} חדרים ו-${points} נקודות שליטה מוכנים לחישוב`;
  qs<HTMLElement>('#review-copy').textContent = `${MODE_LABELS[state.mode] || 'תכנון KNX'} · ${PROPERTY_LABELS[state.project.property] || state.project.property} · ${WORK_LABELS[state.project.work] || state.project.work}`;
}

function validationMessages(recommendations: PositionRecommendation[]): Array<{ ok?: boolean; text: string }> {
  const messages: Array<{ ok?: boolean; text: string }> = [];
  state.rooms.forEach((room) => {
    const recs = recommendations.filter((item) => item.room.id === room.id);
    const hasScreen = recs.some((item) => ['TC4', 'TC5'].includes(item.family));
    if (room.acType === 'vrf' && !hasScreen) messages.push({ text: `${room.name}: הוגדר VRF ללא מסך מתאים.` });
    if (room.acType === 'vrf') messages.push({ text: `${room.name}: יש לאמת מתאם תקשורת למיזוג עם איש המיזוג; נשקל CoolMaster KNX.` });
    if (room.acType === 'unknown' && room.actions.hvac) messages.push({ text: `${room.name}: סוג המיזוג עדיין לא ידוע.` });
    if (room.actions.audio && !hasScreen) messages.push({ text: `${room.name}: אודיו דורש TC4 או TC5.` });
    if (room.type === 'master' && room.bedSides < 2) messages.push({ text: `${room.name}: בחדר הורים מומלצות נקודות בשני צדי המיטה.` });
    if (BEDROOM_TYPES.has(room.type) && room.users >= 2 && room.bedSides < 2) messages.push({ text: `${room.name}: הוגדרו שני משתמשים או יותר אך פחות משתי נקודות מיטה.` });
    if (room.size >= 35 && positionsForRoom(room).length < 2) messages.push({ text: `${room.name}: חדר גדול ללא נקודה נוספת.` });
    if (room.thermostat === 'keep' && hasScreen) messages.push({ text: `${room.name}: תרמוסטט לצד מסך אפשרי, אך יש לתעד מדוע הוא נשאר ומה כל רכיב שולט.` });
    if (room.type === 'entrance' && !room.scenarios.includes('כיבוי כללי')) messages.push({ text: `${room.name}: מומלץ להוסיף תרחיש כיבוי כללי בכניסה.` });
    recs.filter((item) => item.exterior).forEach((item) => {
      if (!item.family.startsWith('PBI')) messages.push({ text: `${room.name}: אין להציב מסך פנימי רגיל באזור חיצוני חשוף.` });
      if (item.operations > 4) messages.push({ text: `${room.name}: מעל ארבע פעולות ב-PBI יש לפצל או להעביר פעולות לנקודה פנימית.` });
    });
  });
  if (state.design.flushLine !== 'no' && state.design.wallFinished === 'finished') messages.push({ text: 'קו אפס נבחר לאחר השלמת הקיר. נדרשת בדיקת היתכנות לפני התחייבות.' });
  if (state.design.flushLine !== 'no' && state.design.wallType === 'stone') messages.push({ text: 'קו אפס בשיש או אבן בדרך כלל אינו מומלץ ונדרש אישור פרט התקנה.' });
  if (!messages.length) messages.push({ ok: true, text: 'לא נמצאו סתירות אוטומטיות. עדיין נדרשת בדיקה מקצועית של התוכניות, הקופסאות והתאימות.' });
  return messages;
}

function quantityMap(recommendations: PositionRecommendation[]): NumberMap {
  const counts: NumberMap = {};
  recommendations.forEach((item) => { counts[item.family] = (counts[item.family] || 0) + 1; });
  state.rooms.forEach((room) => {
    if (room.actions.hvac) counts['נקודות מיזוג'] = (counts['נקודות מיזוג'] || 0) + 1;
    if (room.actions.heating) counts['נקודות חימום'] = (counts['נקודות חימום'] || 0) + 1;
    if (room.actions.audio) counts['נקודות אודיו'] = (counts['נקודות אודיו'] || 0) + 1;
  });
  if (state.design.flushLine !== 'no') counts['מתאמי קו אפס'] = recommendations.filter((item) => !item.exterior).length;
  return counts;
}

function resourceFor(item: PositionRecommendation): (typeof PRODUCT_RESOURCES)[keyof typeof PRODUCT_RESOURCES] {
  if (item.family === 'TC5') return PRODUCT_RESOURCES.tc5;
  if (item.family === 'TC4') return PRODUCT_RESOURCES.tc4;
  if (item.family.startsWith('PBI')) return PRODUCT_RESOURCES.pbi;
  return PRODUCT_RESOURCES.tacteo;
}

function actionInteraction(id: string): string {
  const descriptions: StringMap = {
    lighting: 'לחיצה: הדלקה / כיבוי',
    dimmer: 'מסך: מחוון · לחצן: לחיצה ארוכה',
    shutter: 'פתיחה + סגירה', curtain: 'פתיחה + סגירה', blind24: 'עלייה + ירידה',
    hvac: 'דף מיזוג לפי הממשק', heating: 'הפעלה או טמפרטורה לפי המתאם', audio: 'דף אודיו ייעודי',
    scene: 'לחיצה אחת מפעילה תרחיש', boiler: 'הפעלה / כיבוי', vent: 'הפעלה / כיבוי', fan: 'הפעלה / כיבוי'
  };
  return descriptions[id] || 'לחיצה מפעילה את הפונקציה';
}

function contentItems(item: PositionRecommendation): string {
  const entries = Object.entries(item.room.actions).filter(([, count]) => count > 0);
  if (!entries.length) return '<span class="advisor-chip">ללא תוכן שהוגדר</span>';
  return entries.map(([id, count], index) => {
    const action = ACTION_BY_ID[id as keyof typeof ACTION_BY_ID];
    const label = action?.label || id;
    const amount = count > 1 ? ` × ${count}` : '';
    return `<div class="advisor-rec-function"><span>${index + 1}</span><div><strong>${escapeHtml(label)}${amount}</strong><small>${escapeHtml(actionInteraction(id))}</small></div></div>`;
  }).join('');
}

function deviceVisual(item: PositionRecommendation): string {
  const resource = resourceFor(item);
  return `<img src="${resource.image}" alt="${escapeHtml(resource.alt)}" width="900" height="900" loading="lazy" />`;
}

function renderRoomCoach(): void {
  const root = document.querySelector<HTMLElement>('#room-product-coach');
  if (!root || !state.rooms.length) return;
  const room = currentRoom();
  const position = positionsForRoom(room)[0];
  const item = recommend(room, position.location, position.operations, position.exterior);
  const resource = resourceFor(item);
  const mainActions = Object.keys(room.actions).filter((id) => room.actions[id] > 0).slice(0, 5).map((id) => ACTION_BY_ID[id as keyof typeof ACTION_BY_ID]?.label || id);
  root.innerHTML = `
    <div class="advisor-room-coach-head"><strong>כך הבחירה נראית כרגע: ${escapeHtml(item.model)}</strong><span>${item.operations} פעולות</span></div>
    <div class="advisor-room-coach-body">
      <img src="${resource.image}" alt="${escapeHtml(resource.alt)}" width="900" height="900" loading="lazy" />
      <div><p><strong>למה?</strong> ${escapeHtml(item.reason)}</p><p><strong>מה יהיה עליו?</strong> ${escapeHtml(mainActions.join(', ') || 'עדיין לא נבחר תוכן')}.</p>
      <ul><li>${escapeHtml(item.advantages)}</li><li><strong>לפני הזמנה:</strong> ${escapeHtml(item.verify)}</li></ul>
      <div class="advisor-product-actions"><a class="advisor-text-link" href="${resource.catalog}" target="_blank" rel="noopener">${escapeHtml(resource.catalogLabel)} ←</a><a class="advisor-text-link" href="#switch-lab">פתיחת הבונה החזותי ←</a></div></div>
    </div>`;
}

function renderResults(): void {
  syncProjectAndDesign();
  syncRoomEditor();
  syncSystems();
  saveState(false);
  lastRecommendations = buildRecommendations();
  const quantities = quantityMap(lastRecommendations);
  const totalOperations = lastRecommendations.reduce((sum, item) => sum + item.operations, 0);

  qs<HTMLElement>('#result-stats').innerHTML = [
    [state.rooms.length, 'חדרים ואזורים'], [lastRecommendations.length, 'נקודות שליטה'], [totalOperations, 'פעולות בנקודות'], [Object.values(quantities).reduce((a, b) => a + b, 0), 'רכיבים ונקודות בסיכום']
  ].map(([value, label]) => `<div class="advisor-stat"><strong>${value}</strong><span>${label}</span></div>`).join('');

  qs<HTMLElement>('#recommendation-list').innerHTML = lastRecommendations.map((item, index) => `
    <article class="advisor-recommendation">
      <div class="advisor-rec-head"><h3>קומה ${escapeHtml(item.room.floor)} · ${escapeHtml(item.room.name)}</h3><span>${escapeHtml(item.location)}</span></div>
      <div class="advisor-rec-body">
        <div class="advisor-device-visual">${deviceVisual(item)}</div>
        <div>
          <div class="advisor-rec-meta"><span class="advisor-chip">${item.operations} פעולות</span>${item.systems.map((system) => `<span class="advisor-chip">${escapeHtml(system)}</span>`).join('')}</div>
          <h3 class="advisor-rec-title">${escapeHtml(item.model)} · המלצת I Feel</h3>
          <p class="advisor-rec-copy">${escapeHtml(item.reason)}</p>
          <div class="advisor-rec-functions"><div class="advisor-rec-functions-head"><strong>מה הלקוח יקבל על המפסק?</strong><span>מפת תוכן ראשונית</span></div><div class="advisor-rec-functions-grid">${contentItems(item)}</div></div>
          <div class="advisor-alternatives">
            <div class="advisor-alt"><strong>1. ${escapeHtml(item.model)}</strong><small><b>יתרון:</b> ${escapeHtml(item.advantages)}<br /><b>מגבלה:</b> ${escapeHtml(item.limitations)}<br /><b>לאימות:</b> ${escapeHtml(item.verify)}</small></div>
            ${item.alternatives.map((alternative, alternativeIndex) => `<div class="advisor-alt"><strong>${alternativeIndex + 2}. ${escapeHtml(alternative.title)}</strong><small>${escapeHtml(alternative.copy)}</small></div>`).join('')}
          </div>
          <p class="advisor-help"><strong>לחשמלאי:</strong> ${escapeHtml(item.electricianNote)}<br /><strong>לאיש המיזוג:</strong> ${escapeHtml(item.hvacNote)}</p>
          <div class="advisor-product-actions"><a class="advisor-btn advisor-btn-secondary advisor-btn-sm" href="${resourceFor(item).catalog}" target="_blank" rel="noopener">${escapeHtml(resourceFor(item).catalogLabel)}</a><a class="advisor-btn advisor-btn-ghost advisor-btn-sm" href="#switch-lab">עריכת תוכן בבונה החזותי</a></div>
        </div>
      </div>
    </article>`).join('');

  qs<HTMLElement>('#quantity-summary').innerHTML = `<div class="advisor-result-summary">${Object.entries(quantities).map(([name, count]) => `<div class="advisor-stat"><strong>${count}</strong><span>${escapeHtml(name)}</span></div>`).join('')}</div>`;
  qs<HTMLElement>('#summary-table-body').innerHTML = lastRecommendations.map((item) => `<tr><td>${item.room.floor}</td><td>${escapeHtml(item.room.name)}</td><td>${escapeHtml(item.location)}</td><td>${item.operations}</td><td>${escapeHtml(item.systems.join(', '))}</td><td>${escapeHtml(item.model)}</td><td>${state.design.flushLine === 'no' || item.exterior ? 'לא' : 'כן - לאימות'}</td><td>${escapeHtml(item.verify)}</td></tr>`).join('');

  const checks = validationMessages(lastRecommendations);
  qs<HTMLElement>('#validation-list').innerHTML = checks.map((item) => `<div class="advisor-validation-item ${item.ok ? 'ok' : ''}"><span aria-hidden="true">${item.ok ? '✓' : '!'}</span><span>${escapeHtml(item.text)}</span></div>`).join('');

  qs<HTMLElement>('#advisor-results').hidden = false;
  qs<HTMLElement>('#advisor-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  track('advisor_recommendation_viewed', { mode: state.mode, rooms: state.rooms.length, points: lastRecommendations.length });
  if (state.rooms.length > 1) track('advisor_home_completed', { rooms: state.rooms.length });
}

function summaryText(): string {
  const recommendations = lastRecommendations.length ? lastRecommendations : buildRecommendations();
  const quantities = quantityMap(recommendations);
  const lines = [
    'סיכום יועץ מערכת חשמל חכם ומפסקי KNX - I Feel',
    `נוצר בתאריך: ${new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' }).format(new Date())}`,
    `מסלול: ${MODE_LABELS[state.mode] || state.mode}`,
    `פרויקט: ${PROPERTY_LABELS[state.project.property] || state.project.property} · ${WORK_LABELS[state.project.work] || state.project.work}`,
    '', 'המלצות לפי נקודה:'
  ];
  recommendations.forEach((item) => {
    lines.push(`- קומה ${item.room.floor}, ${item.room.name}, ${item.location}: ${item.operations} פעולות; ${item.model}; מערכות: ${item.systems.join(', ')}.`);
    lines.push(`  לחשמלאי: ${item.electricianNote}`);
    if (item.room.acType !== 'none') lines.push(`  למיזוג: ${item.hvacNote}`);
  });
  lines.push('', 'כמויות:', ...Object.entries(quantities).map(([name, count]) => `- ${name}: ${count}`));
  lines.push('', 'בדיקות:', ...validationMessages(recommendations).map((item) => `- ${item.text}`));
  lines.push('', 'הסתייגות: ההמלצה היא ראשונית ואינה מחליפה תכנון KNX מקצועי, בדיקת תוכניות ותיאום עם החשמלאי, איש המיזוג והאדריכל. ההתאמה הסופית תיקבע לאחר בדיקה מקצועית של I Feel.');
  return lines.join('\n');
}

function downloadSummary(): void {
  const blob = new Blob(['\uFEFF', summaryText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'ifeel-knx-advisor-summary.txt';
  anchor.click();
  URL.revokeObjectURL(url);
  track('advisor_summary_downloaded');
}

function updateLeadMessage(): void {
  const city = qs<HTMLInputElement>('#lead-city').value.trim();
  const plans = qs<HTMLSelectElement>('#lead-plans').value;
  const notes = qs<HTMLTextAreaElement>('#lead-notes').value.trim();
  const prefix = [`עיר: ${city || '-'}`, `תוכניות: ${plans}`, `הערות: ${notes || '-'}`, '', summaryText()].join('\n');
  qs<HTMLInputElement>('#lead-message').value = prefix.slice(0, 3990);
}

function showLeadStatus(): void {
  const params = new URLSearchParams(window.location.search);
  const lead = params.get('lead');
  if (!lead) return;
  const status = qs<HTMLElement>('#lead-status');
  status.hidden = false;
  status.textContent = lead === 'sent' || lead === 'sent-mail' ? 'תודה, הפנייה והסיכום התקבלו. צוות I Feel יחזור אליכם.' : lead === 'missing' ? 'חסרים שם או טלפון. השלימו את השדות ונסו שוב.' : lead === 'bad-email' ? 'כתובת הדואר האלקטרוני אינה תקינה.' : 'השליחה לא הושלמה. אפשר לנסות שוב או ליצור קשר בטלפון.';
  if (lead === 'sent' || lead === 'sent-mail') track('advisor_lead_sent');
}

function startAdvisor(mode: string): void {
  state = initialState(mode);
  restoreStaticFields();
  renderRoomList();
  renderRoomEditor();
  renderSystems();
  renderProgress();
  qs<HTMLElement>('#advisor-wizard-wrap').hidden = false;
  qs<HTMLElement>('#advisor-wizard-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  saveState(false);
  track('advisor_started', { mode });
  track('advisor_project_selected', { mode });
}

function resumeAdvisor(saved: AdvisorState): void {
  state = saved;
  state.currentRoom = Math.min(state.currentRoom || 0, state.rooms.length - 1);
  restoreStaticFields();
  renderRoomList();
  renderRoomEditor();
  renderSystems();
  renderProgress();
  qs<HTMLElement>('#advisor-wizard-wrap').hidden = false;
  qs<HTMLElement>('#advisor-wizard-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  track('advisor_draft_resumed', { step: state.step });
}

function nextStep(): void {
  syncProjectAndDesign();
  syncRoomEditor();
  syncSystems();
  if (state.step === 3 && !state.rooms.length) return;
  state.step = Math.min(TOTAL_STEPS, state.step + 1);
  renderProgress();
  saveState();
  qs<HTMLElement>('#advisor-wizard-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (state.step === 4) track('advisor_room_completed', { rooms: state.rooms.length });
}

function previousStep(): void {
  syncProjectAndDesign();
  syncRoomEditor();
  syncSystems();
  state.step = Math.max(1, state.step - 1);
  renderProgress();
  saveState(false);
  qs<HTMLElement>('#advisor-wizard-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function init(): void {
  const saved = loadSavedState();
  if (saved) qs<HTMLElement>('#resume-draft').hidden = false;
  window.addEventListener('advisor:use-builder', (event) => {
    const detail = (event as CustomEvent<BuilderSelection>).detail;
    if (!detail) return;
    state = initialState('room');
    const room = state.rooms[0];
    room.type = detail.roomType;
    room.name = detail.roomName;
    room.actions = { ...detail.actions };
    room.scenarios = [...detail.scenarios];
    room.acType = detail.acType;
    room.acControl = detail.actions.hvac ? 'temperature' : 'on-off';
    room.floorHeating = detail.floorHeating;
    room.preferredProduct = detail.preferredProduct;
    room.features = detail.exterior ? ['exposed'] : detail.roomType === 'children' ? ['child'] : [];
    room.users = ['master', 'children', 'bedroom'].includes(detail.roomType) ? 2 : 1;
    room.bedSides = detail.roomType === 'master' ? 2 : detail.roomType === 'children' ? 1 : 0;
    state.design.interface = ['tc4', 'tc5'].includes(detail.preferredProduct) ? 'screen' : 'buttons';
    state.design.labels = ['tc4', 'tc5'].includes(detail.preferredProduct) ? 'dynamic' : 'icons';
    state.step = 4;
    restoreStaticFields();
    renderRoomList();
    renderRoomEditor();
    renderSystems();
    renderProgress();
    qs<HTMLElement>('#advisor-wizard-wrap').hidden = false;
    qs<HTMLElement>('#advisor-wizard-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    saveState(false);
  });
  qsa<HTMLButtonElement>('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    qsa<HTMLButtonElement>('[data-mode]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    startAdvisor(button.dataset.mode || 'guided');
  }));
  qs<HTMLButtonElement>('#resume-draft-button').addEventListener('click', () => { if (saved) resumeAdvisor(saved); });
  qs<HTMLButtonElement>('#discard-draft-button').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); qs<HTMLElement>('#resume-draft').hidden = true; });

  qsa<HTMLInputElement | HTMLSelectElement>('[data-project], [data-design], [data-plan]').forEach((input) => input.addEventListener('change', () => {
    syncProjectAndDesign();
    if ((input as HTMLElement).dataset.design === 'flushLine') track('advisor_flush_line_selected', { value: (input as HTMLInputElement).value });
    saveState();
  }));

  ['room-name', 'room-type', 'room-floor', 'room-size', 'room-users', 'room-bed-sides'].forEach((id) => {
    qs<HTMLInputElement | HTMLSelectElement>(`#${id}`).addEventListener('change', () => { syncRoomEditor(); renderRoomList(); renderRoomCoach(); saveState(); });
  });
  qsa<HTMLInputElement>('#room-feature-grid input').forEach((input) => input.addEventListener('change', () => { syncRoomEditor(); renderRoomCoach(); saveState(); }));

  qs<HTMLButtonElement>('#add-room').addEventListener('click', () => {
    syncRoomEditor();
    state.rooms.push(createRoom(state.rooms.length, 'bedroom'));
    state.currentRoom = state.rooms.length - 1;
    renderRoomList(); renderRoomEditor(); renderSystems(); saveState();
    track('advisor_room_added', { rooms: state.rooms.length });
  });
  qs<HTMLButtonElement>('#duplicate-room').addEventListener('click', () => {
    syncRoomEditor();
    const clone = JSON.parse(JSON.stringify(currentRoom())) as RoomState;
    clone.id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    clone.name = `${clone.name} - עותק`;
    state.rooms.splice(state.currentRoom + 1, 0, clone);
    state.currentRoom += 1;
    renderRoomList(); renderRoomEditor(); renderSystems(); saveState();
  });
  qs<HTMLButtonElement>('#delete-room').addEventListener('click', () => {
    if (state.rooms.length === 1 || !window.confirm('למחוק את החדר הזה?')) return;
    state.rooms.splice(state.currentRoom, 1);
    state.currentRoom = Math.max(0, state.currentRoom - 1);
    renderRoomList(); renderRoomEditor(); renderSystems(); saveState();
  });

  ['ac-type', 'ac-control', 'thermostat-choice', 'floor-heating'].forEach((id) => {
    qs<HTMLSelectElement>(`#${id}`).addEventListener('change', () => {
      syncSystems(); renderActions(); renderRoomCoach(); saveState();
      if (id === 'ac-type') track('advisor_hvac_selected', { type: currentRoom().acType });
    });
  });

  qs<HTMLButtonElement>('#next-step').addEventListener('click', nextStep);
  qs<HTMLButtonElement>('#previous-step').addEventListener('click', previousStep);
  qs<HTMLButtonElement>('#show-results').addEventListener('click', renderResults);
  qs<HTMLButtonElement>('#restart-advisor').addEventListener('click', () => {
    if (!window.confirm('למחוק את הטיוטה ולהתחיל מחדש?')) return;
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });
  qs<HTMLButtonElement>('#print-summary').addEventListener('click', () => window.print());
  qs<HTMLButtonElement>('#download-summary').addEventListener('click', downloadSummary);
  qs<HTMLButtonElement>('#edit-answers').addEventListener('click', () => {
    state.step = 1; renderProgress(); qs<HTMLElement>('#advisor-wizard-wrap').hidden = false; qs<HTMLElement>('#advisor-wizard-wrap').scrollIntoView({ behavior: 'smooth' });
  });

  qs<HTMLFormElement>('#advisor-lead-form').addEventListener('submit', (event) => {
    const form = event.currentTarget as HTMLFormElement;
    if (!form.checkValidity() || !qs<HTMLInputElement>('#lead-consent').checked) {
      event.preventDefault();
      form.reportValidity();
      return;
    }
    updateLeadMessage();
    track('advisor_quote_requested', { rooms: state.rooms.length });
  });

  qsa<HTMLElement>('[data-track]').forEach((element) => element.addEventListener('click', () => track(element.dataset.track || 'advisor_click')));
  showLeadStatus();
  restoreStaticFields();
  renderRoomList();
  renderRoomEditor();
  renderSystems();
  renderProgress();
}

function calculateForState(input: AdvisorState): { recommendations: PositionRecommendation[]; checks: Array<{ ok?: boolean; text: string }>; quantities: NumberMap } {
  state = JSON.parse(JSON.stringify(input)) as AdvisorState;
  const recommendations = buildRecommendations();
  return { recommendations, checks: validationMessages(recommendations), quantities: quantityMap(recommendations) };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

export { actionTotal, buildRecommendations, calculateForState, initialState, positionsForRoom, recommend, validationMessages };
