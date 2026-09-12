(function () {
  'use strict';
  window.ifeelSendVerifiedLeadConversion = function (result) {
    if (!result || result.eligible !== true || typeof window.gtag !== 'function') return;
    var hash = result.user_data && result.user_data.sha256_email_address;
    var data = typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
      ? { sha256_email_address: hash } : null;
    // Scope consented data to the Ads conversion; never attach it to GA4 events.
    window.gtag('set', 'user_data', data);
    window.gtag('event', 'conversion', { send_to: 'AW-18038181913/az2mCJjbtcYcEJmgo5lD' });
    window.gtag('set', 'user_data', null);
    window.gtag('event', 'generate_lead', { page_path: window.location.pathname });
  };
}());
