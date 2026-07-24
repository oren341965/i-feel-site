(() => {
  'use strict';

  const form = document.getElementById('project-form');
  if (!form) return;

  const byName = (name) => form.querySelector(`[name="${name}"]:checked`);
  const checkedValues = (name) => Array.from(form.querySelectorAll(`[name="${name}"]:checked`)).map((input) => input.value);
  const labelFor = (input) => input?.closest('.option-card')?.querySelector('strong')?.textContent?.trim() || 'טרם נבחר';
  const text = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  const show = (id, visible) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.classList.toggle('is-visible', Boolean(visible));
    node.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  const giftHidden = document.getElementById('gift-value');
  const giftSection = document.getElementById('gift-choice-section');
  const turntableOption = document.getElementById('gift-turntable-option');
  const tc4Option = document.getElementById('gift-tc4-option');
  const giftRadios = Array.from(form.querySelectorAll('[name="gift_choice"]'));
  const eligibilityText = document.getElementById('eligibility-text');
  const alarmSystem = form.querySelector('[name="systems[]"][value="alarm"]');
  const cameraSystem = form.querySelector('[name="systems[]"][value="cameras"]');

  function setGiftVisibility(turntableEligible, tc4Eligible) {
    const both = turntableEligible && tc4Eligible;
    const any = turntableEligible || tc4Eligible;

    giftSection?.classList.toggle('is-visible', any);
    giftSection?.setAttribute('aria-hidden', any ? 'false' : 'true');
    turntableOption?.classList.toggle('visually-hidden', !turntableEligible);
    tc4Option?.classList.toggle('visually-hidden', !tc4Eligible);

    giftRadios.forEach((radio) => {
      const allowed = radio.value === 'turntable' ? turntableEligible : tc4Eligible;
      radio.disabled = !allowed;
      if (!allowed) radio.checked = false;
    });

    if (!any) {
      giftHidden.value = 'none';
      text('summary-gift', 'לא נקבעה זכאות למתנה בשלב זה');
      if (eligibilityText) eligibilityText.textContent = 'הנחת העובד בשיעור 10% נשמרת. לאחר השלמת הפרטים נבדוק אם ניתן לצרף מתנה.';
      return;
    }

    if (both) {
      const selected = byName('gift_choice');
      giftHidden.value = selected ? selected.value : '';
      text('summary-gift', selected ? labelFor(selected) : 'יש לבחור מתנה אחת');
      if (eligibilityText) eligibilityText.textContent = 'קיימת זכאות לשתי חלופות, אך ניתן לקבל מתנה אחת בלבד. יש לבחור פטיפון או Siemens TC4.';
      return;
    }

    const automatic = turntableEligible ? 'turntable' : 'tc4';
    const automaticRadio = giftRadios.find((radio) => radio.value === automatic);
    if (automaticRadio) automaticRadio.checked = true;
    giftHidden.value = automatic;
    text('summary-gift', automatic === 'turntable' ? 'פטיפון Argon Audio TT MK2' : 'Siemens TC4');
    if (eligibilityText) {
      eligibilityText.textContent = automatic === 'turntable'
        ? 'לפי הסכום שסומן, הפטיפון מצורף כמתנה, בכפוף להצעה הסופית ולתנאי המבצע.'
        : 'לפי פרטי הבנייה והמערכת המלאה, Siemens TC4 הוא חלופת המתנה המתאימה, בכפוף להתאמה טכנית.';
    }
  }

  function update() {
    const property = byName('property');
    const scope = byName('scope');
    const budget = byName('budget');
    const systems = checkedValues('systems[]');
    const alarm = byName('alarm_type');
    const camera = byName('camera_preparations');
    const timeline = byName('timeline');
    const contact = byName('contact_preference');

    show('alarm-options', systems.includes('alarm'));
    show('camera-options', systems.includes('cameras'));

    if (!systems.includes('alarm')) {
      const none = form.querySelector('[name="alarm_type"][value="none"]');
      if (none) none.checked = true;
    }
    if (!systems.includes('cameras')) {
      const unknown = form.querySelector('[name="camera_preparations"][value="unknown"]');
      if (unknown) unknown.checked = true;
    }

    text('summary-property', labelFor(property));
    text('summary-scope', labelFor(scope));
    text('summary-systems', systems.length
      ? systems.map((value) => {
          const input = form.querySelector(`[name="systems[]"][value="${value}"]`);
          return labelFor(input);
        }).join(', ')
      : 'טרם נבחרו מערכות');
    text('summary-alarm', systems.includes('alarm') ? labelFor(alarm) : 'לא נבחרה אזעקה');
    text('summary-cameras', systems.includes('cameras') ? labelFor(camera) : 'לא נבחרו מצלמות');
    text('summary-budget', labelFor(budget));
    text('summary-timeline', labelFor(timeline));
    text('summary-contact', labelFor(contact));

    const turntableEligible = budget?.value === 'over';
    const tc4Eligible = property?.value === 'new' && scope?.value === 'full';
    setGiftVisibility(turntableEligible, tc4Eligible);
  }

  form.addEventListener('change', update);
  giftRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      giftHidden.value = radio.value;
      text('summary-gift', labelFor(radio));
    });
  });

  form.addEventListener('submit', (event) => {
    const property = byName('property');
    const scope = byName('scope');
    const budget = byName('budget');
    const both = property?.value === 'new' && scope?.value === 'full' && budget?.value === 'over';
    if (both && !byName('gift_choice')) {
      event.preventDefault();
      giftSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (eligibilityText) {
        eligibilityText.textContent = 'לפני שליחת הפנייה יש לבחור מתנה אחת בלבד.';
        eligibilityText.focus?.();
      }
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'שולח את הפנייה...';
    }
  });

  update();
})();
