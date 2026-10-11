# I Feel website assistant pilot

## Scope

The first pilot answers free-text questions in Hebrew or English about information already published on i-feel.co.il. Retrieval uses the build-generated `search-index.json`; the assistant returns links to the pages used as sources. Hebrew prefix variants and a small, explicit vocabulary map help retrieval for terms such as `לתריסים`, KNX, BMS, building control, and intercom.

The assistant must say when the site does not contain enough information. It must not invent price, availability, or engineering suitability. A final product or system choice still needs review against the project requirements and manufacturer documentation.

## Data and privacy

- The browser sends the question to `/api/assistant.php`; the PHP endpoint sends that question and up to four short excerpts from the public site index to the OpenAI Responses API.
- The API key is read from the server-side `OPENAI_API_KEY` environment variable. It must never be placed in Astro code, public files, GitHub Actions output, or browser JavaScript.
- Responses use `store: false`. The endpoint does not write question text to application logs, GA4, or Monday. A short-lived file-based limit allows up to 20 requests per IP in 15 minutes.
- The page tells visitors not to enter personal details. Before enabling the assistant in production, confirm that the site's privacy notice and the OpenAI API account settings cover this processing.
- The first pilot does not create leads. The WhatsApp link is a user-initiated contact path; no question or contact details are forwarded automatically.

## Before production activation

1. Confirm that the production PHP runtime has cURL and can read `OPENAI_API_KEY` from its server environment. Do not put the key in the repository. If cPanel cannot provide an environment variable for this PHP process, choose a server-only configuration path before enabling the endpoint.
2. Run the repository build and PHP 7.4 lint/tests in GitHub Actions.
3. Test representative KNX, BMS, product-code, service, and out-of-scope questions on a non-production preview. Check that every answer links to relevant sources and that unsupported questions receive the fallback.
4. Decide whether to add GA4 query measurement only after privacy review. This pilot reports aggregate answer/source counts without sending the text of questions to analytics.
5. Production deployment happens only after a separate review and merge to `main`.
