import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || 'http://localhost:5173',
  base: process.env.SITE_BASE_PATH || '/',
  vite: { plugins: [tailwindcss()] },
  server: { port: 5173 },
});
