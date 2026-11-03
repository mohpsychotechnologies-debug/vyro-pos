import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'src',
  appType: 'spa',
  
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
  
  server: {
    port: 5173,
    host: true,
  },
  
  preview: {
    port: 4173,
    host: true,
  },
});

