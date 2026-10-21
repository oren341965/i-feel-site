import video from './intercom-video.json';

export function intercomVideoSchema(pageUrl) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(video.youtubeId ?? '') || !Number.isFinite(Date.parse(video.uploadDate ?? ''))) {
    throw new Error('Intercom video requires a real YouTube ID and actual upload date.');
  }
  return {
    '@type': 'VideoObject', '@id': `${pageUrl}#intercom-video`,
    name: video.title, description: video.description, uploadDate: video.uploadDate,
    duration: video.duration, inLanguage: 'he-IL',
    thumbnailUrl: `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`,
    contentUrl: `https://www.youtube.com/watch?v=${video.youtubeId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${video.youtubeId}`,
    publisher: { '@id': 'https://i-feel.co.il/#business' }
  };
}
