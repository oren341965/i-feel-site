import knxVideo from '../data/knx-switches-video.json';
import desigoVideo from '../data/desigo-video.json';

const chapters = {
  'siemens-bms-catalog': [[1, 'שער'], [2, 'מסכי מגע TC5'], [5, 'מפסקים חכמים'], [7, 'בקרי KNX'], [9, 'גלאים חכמים']],
  'knx-catalog-2025': [[1, 'שער'], [2, 'מבוא'], [3, 'שליטה'], [5, 'חשמל חכם'], [21, 'אודיו ווידאו'], [24, 'תקשורת']],
  'zwave-catalog-2025': [[1, 'שער'], [4, 'Wanderfull'], [8, 'GlassWand'], [18, 'InWand'], [22, 'ACWand'], [24, 'שליטה'], [26, 'אבטחה'], [28, 'אודיו ווידאו'], [34, 'תקשורת']],
};

const videos = {
  'knx-catalog-2025': knxVideo,
  'siemens-bms-catalog': desigoVideo,
  'meeting-rooms-catalog': { youtubeId: 'Y8EwY5k84hk', title: 'שליטה בתאורה ובווילונות בחדר ישיבות מזכוכית' },
  'zwave-catalog-2025': { youtubeId: 'AZrlxGY4aqQ', title: 'מפסקים אלחוטיים GP9' },
};

const dialog = document.querySelector('#catalog-reader');
const find = (name) => dialog.querySelector(`[data-${name}]`);
const sheet = find('sheet');
const scroller = find('scroll');
const player = find('player');
const contents = find('contents');
const pages = find('pages');
const status = find('status');
const next = find('next');
const prev = find('prev');
const zoom = find('zoom');
const video = find('video');
const share = find('share');
const links = document.querySelectorAll('.catalog-read-link');
const catalogs = new Map();

for (const link of links) {
  const title = link.closest('article')?.querySelector('h3')?.textContent.trim();
  link.setAttribute('aria-label', `דפדוף בקטלוג · ${title}`);
  catalogs.set(link.dataset.catalog, title);
}

let current;
let pdfModule;

function catalogUrl(id, page) {
  const url = new URL('/catalogs/', location.origin);
  url.searchParams.set('catalog', id);
  if (page > 1) url.searchParams.set('page', page);
  return url;
}

async function destinationPage(pdf, destination) {
  const target = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
  const ref = target?.[0];
  if (Number.isInteger(ref)) return ref + 1;
  if (ref && typeof ref === 'object') return (await pdf.getPageIndex(ref)) + 1;
}

async function populateContents(state) {
  const { pdf, id } = state;
  const items = [];
  async function addBookmarks(bookmarks, depth = 0) {
    for (const bookmark of bookmarks) {
      const number = await destinationPage(pdf, bookmark.dest).catch(() => undefined);
      if (number && bookmark.title) items.push([number, bookmark.title, depth]);
      await addBookmarks(bookmark.items ?? [], depth + 1);
    }
  }

  if (chapters[id]) {
    items.push(...chapters[id]);
  } else {
    await addBookmarks(await pdf.getOutline().catch(() => null) ?? []);
  }
  if (current !== state) return;
  if (!items.length) {
    for (let number = 1; number <= pdf.numPages; number++) items.push([number, `עמוד ${number}`]);
  }

  const buttons = items.filter(([number]) => number <= pdf.numPages).map(([number, title, depth = 0]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = title;
    button.dataset.page = number;
    button.style.marginInlineStart = `${Math.min(depth, 4) * 0.5}rem`;
    button.addEventListener('click', () => {
      if (matchMedia('(max-width: 680px)').matches) {
        contents.closest('details').open = false;
        pages.focus();
      }
      showPage(number);
    });
    return button;
  });
  contents.replaceChildren(...buttons);
  markChapter(state.page);
}

function markChapter(number) {
  for (const button of contents.children) {
    if (Number(button.dataset.page) === number) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function showPdf() {
  sheet.hidden = false;
  player.hidden = true;
  player.replaceChildren();
  video.textContent = 'סרטון';
}

async function showPage(number, animate = true) {
  const state = current;
  if (!state?.pdf || !Number.isInteger(number)) return;
  const { pdf } = state;
  number = Math.max(1, Math.min(pdf.numPages, number));
  const direction = Math.sign(number - state.page);
  const revision = ++state.revision;
  const isCurrent = () => current === state && state.revision === revision;
  state.render?.cancel();
  state.page = number;
  pages.value = String(number);
  prev.disabled = number === 1;
  next.disabled = number === pdf.numPages;
  markChapter(number);
  showPdf();
  status.textContent = '';
  history.replaceState(history.state, '', catalogUrl(state.id, number));

  try {
    const page = await pdf.getPage(number);
    if (!isCurrent()) return;
    const base = page.getViewport({ scale: 1 });
    const style = getComputedStyle(scroller);
    const availableWidth = scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight = scroller.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const fit = Math.min(availableWidth / base.width, availableHeight / base.height);
    if (fit <= 0) return;
    const viewport = page.getViewport({ scale: fit * (state.enlarged ? 2 : 1) });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width * pixelRatio);
    canvas.height = Math.ceil(viewport.height * pixelRatio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `עמוד ${number} מתוך ${pdf.numPages}`);
    state.render = page.render({ canvas, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] });
    await state.render.promise;
    const annotations = await page.getAnnotations().catch(() => []);
    if (!isCurrent()) return;
    const elements = annotations.filter((item) => item.subtype === 'Link' && (item.url || item.dest))
      .map((item) => createPageLink(state, viewport, item));
    sheet.replaceChildren(canvas, ...elements);
    scroller.scrollTo(0, 0);

    if (animate && direction && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sheet.animate([
        { transform: `perspective(1000px) rotateY(${direction * 32}deg)`, opacity: 0.65 },
        { transform: 'perspective(1000px) rotateY(0)', opacity: 1 },
      ], { duration: 280, easing: 'ease-out' });
    }
  } catch {
    if (isCurrent()) {
      sheet.replaceChildren();
      status.textContent = 'לא ניתן להציג את העמוד. אפשר לפתוח את קובץ ה־PDF.';
    }
  }
}

function createPageLink(state, viewport, item) {
  const [left, top, right, bottom] = viewport.convertToViewportRectangle(item.rect);
  const link = document.createElement('a');
  Object.assign(link.style, {
    left: `${Math.min(left, right)}px`, top: `${Math.min(top, bottom)}px`,
    width: `${Math.abs(right - left)}px`, height: `${Math.abs(bottom - top)}px`,
  });
  if (item.url && /^(https?:|mailto:|tel:)/i.test(item.url)) {
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', item.url);
  } else if (item.dest) {
    link.href = catalogUrl(state.id, state.page);
    link.setAttribute('aria-label', 'מעבר לעמוד מקושר בקטלוג');
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const number = await destinationPage(state.pdf, item.dest).catch(() => undefined);
      if (current === state) showPage(number);
    });
  }
  return link;
}

async function openCatalog(id, page, trigger) {
  const pdfUrl = `/assets/catalogs/${id}.pdf`;
  const state = { id, trigger, originalUrl: new URL(location.href), page: 1, revision: 0, enlarged: false };
  current = state;
  dialog.querySelector('h2').textContent = catalogs.get(id);
  find('pdf').href = pdfUrl;
  find('total').textContent = '';
  pages.replaceChildren();
  pages.disabled = prev.disabled = next.disabled = zoom.disabled = true;
  zoom.setAttribute('aria-pressed', 'false');
  zoom.textContent = 'הגדלה';
  scroller.removeAttribute('data-enlarged');
  contents.replaceChildren();
  contents.closest('details').open = !matchMedia('(max-width: 680px)').matches;
  video.hidden = !videos[id]?.youtubeId;
  video.disabled = true;
  sheet.replaceChildren();
  showPdf();
  status.textContent = 'טוען קטלוג…';
  history.replaceState(history.state, '', catalogUrl(id, page));
  dialog.showModal();

  try {
    pdfModule ??= Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((error) => {
      pdfModule = undefined;
      throw error;
    });
    const pdfjs = await pdfModule;
    if (current !== state) return;
    state.task = pdfjs.getDocument({ url: pdfUrl, isEvalSupported: false });
    const pdf = await state.task.promise;
    if (current !== state) return;
    state.pdf = pdf;
    for (let number = 1; number <= pdf.numPages; number++) pages.add(new Option(String(number), String(number)));
    find('total').textContent = `מתוך ${pdf.numPages}`;
    pages.disabled = zoom.disabled = video.disabled = false;
    showPage(page, false);
    populateContents(state).catch(() => {});
  } catch {
    if (current === state) status.textContent = 'טעינת הקטלוג נכשלה. אפשר לפתוח את קובץ ה־PDF.';
  }
}

if (typeof dialog.showModal === 'function') {
  document.documentElement.classList.add('catalog-reader-ready');
  for (const link of links) {
    link.addEventListener('click', (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openCatalog(link.dataset.catalog, 1, link);
    });
  }
  const params = new URLSearchParams(location.search);
  const id = params.get('catalog');
  const page = Number(params.get('page'));
  if (catalogs.has(id)) openCatalog(id, Number.isSafeInteger(page) && page > 0 ? page : 1);
}

find('close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  const state = current;
  current = undefined;
  state?.render?.cancel();
  state?.task?.destroy().catch(() => {});
  showPdf();
  sheet.replaceChildren();
  const url = state.originalUrl;
  url.searchParams.delete('catalog');
  url.searchParams.delete('page');
  history.replaceState(history.state, '', url);
  state?.trigger?.focus();
});

prev.addEventListener('click', () => showPage(current.page - 1));
next.addEventListener('click', () => showPage(current.page + 1));
pages.addEventListener('change', () => showPage(Number(pages.value)));
zoom.addEventListener('click', () => {
  current.enlarged = !current.enlarged;
  zoom.setAttribute('aria-pressed', String(current.enlarged));
  zoom.textContent = current.enlarged ? 'התאמה למסך' : 'הגדלה';
  scroller.toggleAttribute('data-enlarged', current.enlarged);
  showPage(current.page, false);
});

video.addEventListener('click', () => {
  if (!player.hidden) {
    showPage(current.page, false);
    return;
  }
  const clip = videos[current.id];
  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube-nocookie.com/embed/${clip.youtubeId}`;
  frame.title = clip.title;
  frame.allowFullscreen = true;
  sheet.hidden = true;
  player.hidden = false;
  player.replaceChildren(frame);
  video.textContent = 'חזרה לקטלוג';
});

share.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    status.textContent = 'הקישור הועתק';
  } catch {
    status.textContent = 'אפשר להעתיק את הקישור משורת הכתובת.';
  }
});

dialog.addEventListener('keydown', (event) => {
  if (!current?.pdf || event.target.closest('select, iframe') || !player.hidden) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  showPage(current.page + (event.key === 'ArrowLeft' ? 1 : -1));
});

let swipe;
scroller.addEventListener('touchstart', (event) => {
  swipe = event.touches.length === 1 ? event.touches[0] : undefined;
}, { passive: true });
scroller.addEventListener('touchend', (event) => {
  if (!swipe || !current?.pdf || current.enlarged || !player.hidden) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipe.clientX;
  const dy = touch.clientY - swipe.clientY;
  swipe = undefined;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    showPage(current.page + Math.sign(dx));
  }
}, { passive: true });

new ResizeObserver(() => {
  if (current?.pdf && player.hidden) showPage(current.page, false);
}).observe(scroller);
