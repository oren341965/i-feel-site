(() => {
  const controller = new AbortController();

  async function registerIfeelWebMcp() {
    const modelContext = document.modelContext;
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
      description: 'Search the I Feel website index and return the most relevant pages for a smart-home, BMS, KNX, DALI, security, networking, intercom, audio or service topic.',
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
      async execute({ topic }, { signal } = {}) {
        const q = String(topic || '').trim();
        if (!q) {
          return { found: false, reason: 'topic is required', results: [] };
        }

        const normalize = (value) => String(value || '')
          .normalize('NFKD')
          .toLocaleLowerCase('he')
          .replace(/[\u0591-\u05c7]/g, '')
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim();

        const query = normalize(q);
        const terms = query.split(/\s+/).filter(Boolean);
        const response = await fetch('/search-index.json', {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal
        });
        if (!response.ok) {
          throw new Error('I Feel search index is temporarily unavailable');
        }

        const records = await response.json();
        const scored = (Array.isArray(records) ? records : [])
          .map((record) => {
            const title = normalize(record.title);
            const description = normalize(record.description);
            const headings = normalize(record.headings);
            const body = normalize(record.body);
            const all = title + ' ' + description + ' ' + headings + ' ' + body;
            const matchedTerms = terms.filter((term) => all.includes(term)).length;
            if (!matchedTerms) return null;
            let score = matchedTerms * 10;
            if (title.includes(query)) score += 60;
            if (headings.includes(query)) score += 30;
            if (description.includes(query)) score += 20;
            if (body.includes(query)) score += 5;
            return {
              score,
              title: String(record.title || ''),
              description: String(record.description || ''),
              url: new URL(String(record.url || '/'), window.location.origin).href
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ score, ...record }) => record);

        return {
          found: scored.length > 0,
          query: q,
          results: scored,
          contactUrl: 'https://i-feel.co.il/contactus/'
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
          portalUrl: 'https://i-feel.co.il/customer-portal/index.php',
          currentCapabilities: [
            'Secure email OTP customer login',
            'Server-side customer matching to Monday',
            'Service-agreement eligibility',
            'Authenticated WebMCP entitlement lookup'
          ],
          plannedCapabilities: [
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
        window.location.assign('/customer-portal/index.php');
        return { opened: true, url: 'https://i-feel.co.il/customer-portal/index.php' };
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
