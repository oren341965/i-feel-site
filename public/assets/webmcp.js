(() => {
  const controller = new AbortController();

  async function registerIfeelWebMcp() {
    const modelContext = document.modelContext || navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') {
      return;
    }

    const register = (definition) =>
      modelContext.registerTool(definition, { signal: controller.signal });

    await register({
      name: 'get_ifeel_company_capabilities',
      description: 'Return the main I Feel smart-home and building-control solution areas available in Israel.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      execute() {
        return {
          company: 'I Feel Smart Home & BMS',
          website: 'https://i-feel.co.il/',
          solutionAreas: [
            'KNX smart home',
            'Siemens Desigo building management systems',
            'DALI lighting control',
            'Smart-home upgrades and service',
            'Security, cameras and intercom',
            'Aruba networking',
            'Audio and home cinema'
          ],
          contact: {
            phone: '+972-3-508-9553',
            salesEmail: 'sales@i-feel.co.il'
          }
        };
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false
      }
    });

    await register({
      name: 'find_ifeel_page',
      description: 'Find the best I Feel website page for a smart-home, BMS, KNX, DALI, security, networking, intercom, audio or service topic.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The product, technology, service or solution the user is looking for.'
          }
        },
        required: ['topic'],
        additionalProperties: false
      },
      execute({ topic }) {
        const q = String(topic || '').trim();
        if (!q) {
          return { found: false, reason: 'topic is required' };
        }
        return {
          found: true,
          searchUrl: 'https://i-feel.co.il/?s=' + encodeURIComponent(q),
          contactUrl: 'https://i-feel.co.il/contactus/',
          note: 'Use the website search first. If no exact match is available, continue to the contact page.'
        };
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false
      }
    });

    await register({
      name: 'get_ifeel_customer_portal_status',
      description: 'Explain the current status and intended capabilities of the I Feel customer purchasing portal.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      execute() {
        return {
          status: 'foundation',
          portalUrl: 'https://i-feel.co.il/customer-portal/',
          currentCapabilities: [
            'Public portal information',
            'WebMCP discovery'
          ],
          plannedCapabilities: [
            'Secure customer login',
            'Server-side customer matching to Monday',
            'Service-agreement eligibility',
            'Customer-specific product catalog and pricing',
            'Confirmed cart and checkout'
          ],
          security: 'No Monday token, service agreement, customer identity or private pricing is exposed to client-side WebMCP.'
        };
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false
      }
    });

    await register({
      name: 'open_ifeel_customer_portal',
      description: 'Open the I Feel customer portal page so the user can continue through the human interface.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      execute() {
        window.location.assign('/customer-portal/');
        return { opened: true, url: 'https://i-feel.co.il/customer-portal/' };
      },
      annotations: {
        readOnlyHint: false,
        consequentialHint: false,
        untrustedContentHint: false
      }
    });
  }

  registerIfeelWebMcp().catch((error) => {
    console.warn('[I Feel WebMCP] registration failed', error);
  });

  window.addEventListener('pagehide', () => controller.abort(), { once: true });
})();
