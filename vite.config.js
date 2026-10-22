import { defineConfig } from 'vite';
export default defineConfig({
  // Relative URLs allow the exact same dist/ to run on Pages, other subpaths and Tauri.
  base: './',
  clearScreen: false,
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  preview: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  build: { target: 'es2021', chunkSizeWarningLimit: 950 }
});
