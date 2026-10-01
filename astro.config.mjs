import { defineConfig } from 'astro/config';
import searchIndex from './src/integrations/search-index.mjs';

export default defineConfig({
  site: 'https://i-feel.co.il',
  integrations: [searchIndex()],
  devToolbar: { enabled: false },
  output: 'static'
});
