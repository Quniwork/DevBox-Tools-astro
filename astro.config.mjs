// @ts-check
import { defineConfig } from 'astro/config';

import vue from '@astrojs/vue';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // chrome extension 需要相對路徑
  base: './',
  build: {
    format: 'file',
    assets: 'assets'
  },
  integrations: [vue()],

  vite: {
    build: {
      assetsDir: 'assets' // 將 _astro 改為 assets，避開 Chrome Extension 限制
    },
    plugins: [tailwindcss()]
  }
});