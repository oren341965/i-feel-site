(() => {
  const modelContext = document.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') return;

  const controller = new AbortController();

  const fetchProfile = async (signal) => {
    const response = await fetch('/customer-portal/profile.php', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
      signal
    });
    if (response.status === 401) {
      return { authenticated: false, loginUrl: 'https://i-feel.co.il/customer-portal/index.php' };
    }
    if (!response.ok) throw new Error('Customer portal profile request failed');
    return await response.json();
  };

  modelContext.registerTool({
    name: 'get_ifeel_customer_entitlements',
    description: 'Return the signed-in I Feel customer service-agreement status and eligible products. Requires the customer to be authenticated in the I Feel customer portal.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_input, { signal }) {
      return await fetchProfile(signal);
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    }
  }, { signal: controller.signal }).catch(() => {});

  modelContext.registerTool({
    name: 'get_ifeel_eligible_products',
    description: 'Return products and services currently eligible for the signed-in I Feel customer according to the server-side service-agreement rules.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_input, { signal }) {
      const profile = await fetchProfile(signal);
      return {
        authenticated: profile.authenticated === true,
        eligibleProducts: Array.isArray(profile.eligibleProducts) ? profile.eligibleProducts : [],
        note: 'Ordering and payment are not enabled yet and require explicit customer confirmation.'
      };
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    }
  }, { signal: controller.signal }).catch(() => {});

  window.addEventListener('pagehide', () => controller.abort(), { once: true });
})();
