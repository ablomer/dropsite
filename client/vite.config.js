import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001, // Client dev server port, different from backend
    proxy: {
      // Proxy /files API requests to the backend server
      '/files': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true
      },
      // Ensure trailing slash proxied routes work too
      '/files/': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    },
  },
}); 