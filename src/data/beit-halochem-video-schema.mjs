import video from './beit-halochem-video.json';
export function beitHalochemVideoSchema(pageUrl) {
  return {
    '@type': 'VideoObject', '@id': `${pageUrl}#beit-halochem-video`,
    name: video.title, description: video.description, uploadDate: video.uploadDate,
    duration: video.duration, inLanguage: 'he-IL',
    thumbnailUrl: `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`,
    contentUrl: `https://www.youtube.com/watch?v=${video.youtubeId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${video.youtubeId}`,
    publisher: { '@id': 'https://i-feel.co.il/#business' }
  };
}
