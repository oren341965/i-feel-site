export const outdoorLedVideo = {
  title: 'מסכי LED חוץ לבריכה ולווילה — יום ולילה | i-feel',
  description: 'הדמיה של מסך LED חוץ ליד בריכה: הדלקה הדרגתית, עמעום, צפייה ביום ובלילה, גדלים ומפרט PixelPro Outdoor P2.976. ללא מחירים. התצורה הסופית מותאמת לפרויקט.',
  contentUrl: 'https://i-feel.co.il/assets/videos/outdoor-led-day-night-music-v2.webm',
  posterUrl: 'https://i-feel.co.il/assets/videos/outdoor-led-day-night.jpg',
  duration: 'PT53.5S',
  uploadDate: '2026-10-10',
  pageUrl: 'https://i-feel.co.il/outdoor-led-screens/#outdoor-led-video',
  tiktokUrl: 'https://www.tiktok.com/@orenlevy4/video/7695124410692406535'
};

export function outdoorLedVideoSchema(pageUrl) {
  return {
    '@type': 'VideoObject',
    '@id': `${pageUrl}#outdoor-led-video`,
    name: outdoorLedVideo.title,
    description: outdoorLedVideo.description,
    uploadDate: outdoorLedVideo.uploadDate,
    duration: outdoorLedVideo.duration,
    thumbnailUrl: outdoorLedVideo.posterUrl,
    contentUrl: outdoorLedVideo.contentUrl,
    inLanguage: 'he-IL',
    publisher: { '@id': 'https://i-feel.co.il/#business' }
  };
}
