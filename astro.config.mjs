import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://i-feel.co.il',
  integrations: [tailwind()],
  devToolbar: { enabled: false },
  output: 'static'
});
