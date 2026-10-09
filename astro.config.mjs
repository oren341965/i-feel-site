import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import searchIndex from './src/integrations/search-index.mjs';

export default defineConfig({
  site: 'https://i-feel.co.il',
  integrations: [tailwind(), searchIndex()],
  devToolbar: { enabled: false },
  output: 'static'
});
