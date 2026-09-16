(function () {
  'use strict';
  var sent = new Set();
  window.ifeelSendVerifiedLeadConversion = function (result) {
    if (!result || result.eligible !== true || typeof window.gtag !== 'function') return;
    var eventId = result.event_id;
    if (typeof eventId !== 'string' || !/^ifeel_[a-f0-9]{32}$/.test(eventId) || sent.has(eventId)) return;
    // Mark before enqueueing: an exception must not cause duplicate conversions.
    sent.add(eventId);
    var hash = result.user_data && result.user_data.sha256_email_address;
    var data = typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
      ? { sha256_email_address: hash } : null;
    // Scope consented data to the Ads conversion; never attach it to GA4 events.
    try {
      window.gtag('set', 'user_data', data);
      window.gtag('event', 'conversion', {
        send_to: 'AW-18038181913/az2mCJjbtcYcEJmgo5lD', transaction_id: eventId
      });
    } finally {
      window.gtag('set', 'user_data', null);
    }
    // Correlation parameter only: GA4 event_id is NOT claimed as automatic deduplication.
    window.gtag('event', 'generate_lead', { page_path: window.location.pathname, event_id: eventId });
  };
}());
