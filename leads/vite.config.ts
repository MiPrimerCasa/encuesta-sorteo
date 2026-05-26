import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const base = process.env.VITE_BASE || '/leads/';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
  build: {
    target: 'es2020',
  },
  server: {
    proxy: {
      [`${base.replace(/\/$/, '')}/api`]: {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
