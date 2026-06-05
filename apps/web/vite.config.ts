import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  css: {
    postcss: './postcss.config.js',
  },
  // Load .env from the monorepo root (two levels up from apps/web)
  envDir: path.resolve(__dirname, '../..'),
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor dependencies into separate cacheable chunks so the
        // initial (landing) bundle stays small. Vite 8 removed the object form of
        // manualChunks; the function form is still supported and lets us group
        // each vendor by its node_modules path.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react-router-dom/') || id.includes('/react-router/')) {
            return 'vendor-router';
          }
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }
          if (id.includes('/gsap/') || id.includes('/@gsap/')) {
            return 'vendor-gsap';
          }
          if (id.includes('/@clerk/')) {
            return 'vendor-clerk';
          }
          if (id.includes('/axios/')) {
            return 'vendor-axios';
          }
          if (id.includes('/lucide-react/')) {
            return 'vendor-icons';
          }
          return undefined;
        },
      },
    },
  },
});
