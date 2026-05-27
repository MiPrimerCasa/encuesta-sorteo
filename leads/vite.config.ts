import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE || '/',
  define: {
    'import.meta.env.VITE_DEMO': JSON.stringify(mode === 'demo' ? 'true' : 'false'),
  },
  build: {
    target: 'es2020',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
