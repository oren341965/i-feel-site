(() => {
  'use strict';

  function createPhotoFigure({ src, alt, caption = '', variant = '' }) {
    const figure = document.createElement('figure');
    figure.className = `real-photo-frame${variant ? ` ${variant}` : ''}`;

    const image = document.createElement('img');
    image.className = 'real-photo';
    image.src = src;
    image.alt = alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.appendChild(image);

    if (caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.className = 'photo-caption';
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }

    return figure;
  }

  function prependPhoto(card, photo) {
    if (!card || card.dataset.photoEnhanced === 'true') return;
    card.dataset.photoEnhanced = 'true';
    card.classList.add('card-with-photo');
    card.prepend(createPhotoFigure(photo));
  }

  function enhanceWithRealPhotos() {
    if (!document.getElementById('mtlaw-real-photos-css')) {
      const stylesheet = document.createElement('link');
      stylesheet.id = 'mtlaw-real-photos-css';
      stylesheet.rel = 'stylesheet';
      stylesheet.href = '/mt-law/real-photos.css?v=1';
      document.head.appendChild(stylesheet);
    }

    const hero = document.querySelector('.hero');
    if (hero && hero.dataset.photoEnhanced !== 'true') {
      hero.dataset.photoEnhanced = 'true';
      hero.classList.add('hero--real-photo');
      const credit = document.createElement('span');
      credit.className = 'hero-photo-credit';
      credit.textContent = 'צילום מפרויקט בית חכם של I Feel';
      hero.appendChild(credit);
    }

    const aboutPhotos = [
      {
        src: '/assets/projects/villa-caesarea.jpg',
        alt: 'וילה בקיסריה עם מערכת בית חכם של I Feel',
      },
      {
        src: '/projects/knx-smart-home-central-moshav/08-smart-kitchen-knx.jpg',
        alt: 'מטבח חכם עם תאורה וגלאי במערכת KNX של I Feel',
      },
      {
        src: '/projects/knx-smart-home-central-moshav/05-knx-touch-panel-kitchen.jpg',
        alt: 'מסך מגע KNX מותקן במטבח בפרויקט של I Feel',
      },
    ];
    document.querySelectorAll('#about .info-tile').forEach((card, index) => {
      const photo = aboutPhotos[index];
      if (photo) prependPhoto(card, photo);
    });

    const turntableArt = document.querySelector('.turntable-art');
    if (turntableArt) {
      turntableArt.replaceWith(createPhotoFigure({
        src: '/mt-law/product-image.php?v=1',
        alt: 'פטיפון Argon Audio TT MK2 בגוון Earth Grey',
        caption: 'תמונת מוצר אמיתית באדיבות TRES',
        variant: 'gift-photo-frame gift-photo-frame--product',
      }));
    }

    const tc4Art = document.querySelector('.tc4-art');
    if (tc4Art) {
      tc4Art.replaceWith(createPhotoFigure({
        src: '/projects/knx-smart-home-central-moshav/07-knx-touch-panel-display.jpg',
        alt: 'תצוגת מסך מגע KNX בפרויקט בית חכם של I Feel',
        caption: 'מסך מגע מותקן בפרויקט I Feel. דגם המתנה הוא Siemens TC4',
        variant: 'gift-photo-frame gift-photo-frame--installation',
      }));
    }

    const systemPhotos = [
      {
        src: '/projects/knx-smart-home-central-moshav/09-smart-living-room-knx.jpg',
        alt: 'סלון חכם עם תאורה ותריסים בשליטת KNX של I Feel',
      },
      {
        src: '/projects/knx-smart-home-central-moshav/12-knx-detector-outdoor-siren.jpg',
        alt: 'גלאי נוכחות חיצוני וצופר אזעקה בפרויקט בית חכם של I Feel',
      },
      {
        src: '/projects/knx-smart-home-central-moshav/15-outdoor-security-camera.jpg',
        alt: 'מצלמת אבטחה חיצונית המותקנת בגינה בפרויקט של I Feel',
      },
      {
        src: '/projects/knx-smart-home-central-moshav/06-knx-touch-panel-wide.jpg',
        alt: 'מסך שליטה מרכזי בבית חכם KNX של I Feel',
      },
    ];
    document.querySelectorAll('#systems .system-card').forEach((card, index) => {
      const photo = systemPhotos[index];
      if (photo) prependPhoto(card, photo);
    });
  }

  enhanceWithRealPhotos();

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
