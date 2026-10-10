import video from './knx-switches-video.json';

export function knxSwitchesVideoSchema(pageUrl) {
  if (!video.youtubeId && !video.uploadDate) return null;
  if (!/^[A-Za-z0-9_-]{11}$/.test(video.youtubeId ?? '') || !Number.isFinite(Date.parse(video.uploadDate ?? ''))) {
    throw new Error('KNX switches video requires a real YouTube ID and actual upload date.');
  }
  return {
    '@type': 'VideoObject', '@id': `${pageUrl}#knx-switches-video`,
    name: video.title, description: video.description, uploadDate: video.uploadDate,
    duration: video.duration, inLanguage: 'he-IL',
    thumbnailUrl: `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`,
    contentUrl: `https://www.youtube.com/watch?v=${video.youtubeId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${video.youtubeId}`,
    publisher: { '@id': 'https://i-feel.co.il/#business' }
  };
}
