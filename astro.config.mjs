import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || 'http://localhost:5173',
  base: process.env.SITE_BASE_PATH || '/',
  // Keep resolver discovery inside this project, including nested Git worktrees.
  vite: { tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)), plugins: [tailwindcss()] },
  server: { port: 5173 },
});
