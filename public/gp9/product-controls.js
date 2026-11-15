const configRoutes = new Map([
  ['תאורה בלבד', 'gp9-lighting'],
  ['תריסים בלבד', 'gp9-shutters'],
  ['2 תאורות + 2 תריסים', 'gp9-2lights-2shutters'],
  ['4 תאורות + תריס', 'gp9-4lights-shutter'],
]);
const colorButtons = [...document.querySelectorAll('[data-color]')];
const configButtons = [...document.querySelectorAll('[data-config]')];
const heading = document.querySelector('.productInfo h1');
const selection = document.getElementById('selection');
const copy = document.getElementById('copy');
const copyLabel = copy.textContent;
let chosenColor = colorButtons[0].dataset.color;
let chosenConfig = configButtons[0].dataset.config;

function refreshSelection() {
  for (const button of [...colorButtons, ...configButtons]) {
    const active = button.dataset.color === chosenColor || button.dataset.config === chosenConfig;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  heading.textContent = 'מפסק זכוכית GP9 — ' + chosenConfig;
  selection.firstChild.textContent = 'בחירה: ' + chosenColor + ' · ' + chosenConfig;
  copy.textContent = copyLabel;
}

function selectFromHash() {
  const match = [...configRoutes].find(([, route]) => location.hash === '#' + route);
  if (match) chosenConfig = match[0];
  refreshSelection();
}

for (const button of colorButtons) {
  button.addEventListener('click', () => {
    chosenColor = button.dataset.color;
    refreshSelection();
  });
}
for (const button of configButtons) {
  button.addEventListener('click', () => {
    chosenConfig = button.dataset.config;
    history.replaceState(null, '', '#' + configRoutes.get(chosenConfig));
    refreshSelection();
  });
}

function configurationText() {
  return 'GP9 | ' + chosenColor + ' | ' + chosenConfig;
}

copy.addEventListener('click', async () => {
  const text = configurationText();
  try {
    await navigator.clipboard.writeText(text);
    copy.textContent = 'התצורה הועתקה';
  } catch {
    window.prompt('העתיקו את הבחירה:', text);
  }
});

for (const id of ['quote', 'mobileQuote']) {
  document.getElementById(id).addEventListener('click', () => {
    navigator.clipboard?.writeText(configurationText()).catch(() => {});
    window.open('/contactus/', '_blank', 'noopener');
  });
}
window.addEventListener('hashchange', selectFromHash);
selectFromHash();
