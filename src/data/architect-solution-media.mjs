// Captions identify project photography, supplier demonstrations and AI illustrations.
// Images remain unedited; visual inspection is recorded in docs/architect-solution-media.md.
export const architectSolutionMedia = {
  'glass-meeting-rooms': {
    type: 'image', src: '/assets/architect-solutions/enlighted-glass-wall.png',
    alt: 'צילום המפסק Enlighted Room Control מותקן על קיר זכוכית',
    caption: 'צילום מהשטח שסיפק אורן: המפסק מותקן על הזכוכית, ללא תעלת חשמל גלויה אליו.',
    problemCue: 'קיר זכוכית בלי מסלול לחיווט המפסק', solutionCue: 'נקודת שליטה נגישה על הזכוכית',
    sourceLabel: 'צילום אמיתי · I FEEL',
    secondaryVideo: { id: 'Y8EwY5k84hk', label: 'לסרטון ההסבר של I FEEL', note: 'סרטון שיווקי הכולל הדמיות וקריינות בקולו של אורן.' },
  },
  'projector-hidden-ceiling': {
    type: 'native-video', src: '/assets/architect-solutions/ifeel-projector-lift.webm',
    poster: '/assets/architect-solutions/ifeel-projector-lift.webp',
    title: 'צילום I FEEL: מעלית מקרן נפתחת ונסגרת בתקרה',
    caption: 'צילום מהתקנה של I FEEL: הפתח בתקרה נפתח, המעלית יורדת לשימוש ועולה חזרה בסיום.',
    problemCue: 'מקרן קבוע שנשאר גלוי בתקרה', solutionCue: 'מעלית מקרן שמשתלבת בתקרה כשהיא סגורה',
    sourceLabel: 'צילום התקנה · I FEEL', sourceUrl: 'https://www.tiktok.com/@orenlevy4/video/7681276958734454037',
    sourceLinkText: 'לסרטון המלא של I FEEL בטיקטוק ↗',
  },
  'tv-without-wall': {
    type: 'image', src: '/assets/tv-pole/floor-tv-pole-open-space.jpg',
    alt: 'טלוויזיה על עמוד רצפתי מול חזית זכוכית, ללא קיר לתלייה',
    caption: 'צילום אמיתי: המסך מוצב מול חזית זכוכית בעזרת עמוד רצפתי. הכבלים עוברים בתוך העמוד.',
    problemCue: 'חזית זכוכית במקום קיר לתלייה', solutionCue: 'עמוד רצפתי עם כבילה נסתרת', sourceLabel: 'צילום אמיתי · I FEEL',
    detailImage: { src: '/assets/tv-pole/floor-tv-pole-rear-cover.jpg', alt: 'כיסוי אחורי בעמוד הטלוויזיה שמסתיר את אזור החיבורים', caption: 'פרט הפתרון: כיסוי אחורי לאזור הכבילה והחיבורים.' },
  },
  'tv-carpentry': {
    type: 'image', src: '/projects/smart-villa-ramot-hashavim/ramot-hashavim-living-room.jpg',
    alt: 'צילום סלון ברמות השבים עם טלוויזיה משולבת בתוך קיר נגרות',
    caption: 'מתוך פרויקט הבית החכם של I FEEL ברמות השבים: מסך משולב בנגרות. התמונה ממחישה את התוצאה העיצובית; היא אינה פרט מידות או אישור לאוורור הנישה.',
    problemCue: 'מסך, תושבת וחיבורים שצריכים להשתלב בנגרות', solutionCue: 'תיאום מוקדם של הנישה עם דגם המסך',
    sourceLabel: 'צילום פרויקט · רמות השבים', sourceUrl: '/projects/smart-villa-ramot-hashavim/',
  },
  'outdoor-screen': {
    type: 'youtube', videoId: '3yYrPLeujJ4', title: 'Dicolor — הדגמת מסכי LED לשימושי חוץ ופנים',
    caption: 'סרטון הדגמה של יצרן מסכי LED, Dicolor. הוא ממחיש את התצוגה ואת הרכבת המסך; תצורת גינה, בריכה או קונסטרוקציה בפרויקט שלכם דורשת אפיון נפרד.',
    problemCue: 'תצוגה גדולה שצריכה להתאים לתנאי חוץ', solutionCue: 'מסך LED ותשתית שנבחרים לפי האתר',
    sourceLabel: 'סרטון יצרן · Dicolor', sourceUrl: 'https://www.youtube.com/watch?v=3yYrPLeujJ4',
    note: 'זהו סרטון יצרן להמחשת הטכנולוגיה, ולא צילום של התקנת I FEEL בגינה.',
  },
  'meeting-room-control': {
    type: 'image', src: '/projects/countrite-technologies/countrite-technologies-25.jpg',
    alt: 'חדר ישיבות אמיתי בפרויקט CountRite עם מסך, מערכת שיחות וידאו וצלונים',
    caption: 'חדר הישיבות בפרויקט CountRite של I FEEL: מסך ושיחות וידאו לצד תאורה וצלונים. ממשק השליטה ותרחישי החדר מוגדרים לפי הציוד והפרויקט.',
    problemCue: 'כמה מערכות באותו חדר', solutionCue: 'תכנון תפעול משולב לפי תרחישי שימוש',
    sourceLabel: 'צילום פרויקט · CountRite', sourceUrl: '/projects/countrite-technologies/',
  },
  'switch-design': {
    type: 'image', src: '/assets/knx-advisor/tav-tc4-flush-installed.webp',
    alt: 'צילום מסך שליטה Siemens TC4 מותקן במסגרת השקעה בקיר',
    caption: 'צילום התקנת Siemens TC4 בקופסת השקעה: נקודת השליטה משתלבת במישור הגמר. מסגרת, קופסה ומספר הפעולות מתואמים לפני סגירת הקיר.',
    problemCue: 'נקודת שליטה שצריכה להתאים לעיצוב ולשימוש', solutionCue: 'בחירת ממשק ותכנון ההתקנה יחד', sourceLabel: 'צילום התקנה · I FEEL',
    secondaryVideo: { id: 'puG0qeaD-oU', label: 'לסרטון מבחר מפסקי KNX', note: 'סרטון מבחר הסדרות של I FEEL; התאמה נקבעת לפי הדגם והמערכת.' },
  },
  'custom-installation-boxes': {
    type: 'image', src: '/assets/knx-advisor/tav-tc4-flush-installed.webp',
    alt: 'מסך Siemens TC4 מותקן בקו הקיר באמצעות קופסת השקעה תואמת',
    caption: 'דוגמה מצולמת: מסך Siemens TC4 בקופסת השקעה תואמת. למסכים, גלאים ואינטרקום אחרים בודקים התאמה לפי דגם.',
    problemCue: 'המכשיר צריך להשתלב בקו הגמר', solutionCue: 'מתאמים קופסה לפי הדגם, העומק וגישה לשירות',
    sourceLabel: 'צילום התקנה · I FEEL',
    detailImage: { src: '/assets/knx-advisor/tav-tc4-flush-box.webp', alt: 'קופסת השקעה לדגם Siemens TC4', caption: 'הקופסה בצילום מתאימה לדגם TC4 ואינה קופסה אוניברסלית.' },
  },
};
