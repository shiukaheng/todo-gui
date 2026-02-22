import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://100.83.86.3';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  define: {
    // Polyfill process.env for packages that expect Node.js environment
    'process.env': {},
    'process.version': JSON.stringify(''),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/todo/api'),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
