import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // API_TARGET points browser tests at their isolated backend.
    proxy: Object.fromEntries(['/requests', '/actors', '/health'].map(path => [path, process.env.API_TARGET || 'http://127.0.0.1:3000'])),
  },
});
