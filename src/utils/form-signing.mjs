export function getSigningUrl(config) {
 if (!config?.completionDeliveryVerified || !config.templateId) return '';
 try {
  const url = new URL(config.powerFormUrl);
  if (url.protocol !== 'https:' || !/(^|\.)docusign\.(com|net)$/.test(url.hostname) || !/powerform/i.test(url.pathname) || url.username || url.password) return '';
  return url.href;
 } catch { return ''; }
}
