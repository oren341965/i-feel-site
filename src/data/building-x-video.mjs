const youtubeId = 'oWzPM6B1NJw';
const uploadDate = '2026-11-23';

export const buildingXVideo = {
  canonical: 'https://i-feel.co.il/articles/siemens-building-x/',
  title: 'Siemens Building X: ניהול אנרגיה ותפעול מבנים בענן',
  description: 'אורן לוי מ־I FEEL מסביר איך Building X של סימנס מרכזת נתוני מבנים, עוזרת לזהות צריכת אנרגיה חריגה ומוסיפה כלי ניטור ותפעול מעל מערכת הבקרה הקיימת.',
  uploadDate,
  duration: 'PT42S',
  poster: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
  watchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
  embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
};

export const buildingXVideoSchema = {
  '@type': 'VideoObject',
  '@id': buildingXVideo.canonical + '#video-object',
  name: buildingXVideo.title,
  description: buildingXVideo.description,
  thumbnailUrl: buildingXVideo.poster,
  uploadDate: buildingXVideo.uploadDate,
  duration: buildingXVideo.duration,
  embedUrl: buildingXVideo.embedUrl,
  inLanguage: 'he-IL',
  publisher: { '@id': 'https://i-feel.co.il/#business' },
};
