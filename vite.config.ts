import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/todo/',
  plugins: [react()],
  define: {
    // Polyfill process.env for packages that expect Node.js environment
    'process.env': {},
    'process.version': JSON.stringify(''),
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
  },
});
