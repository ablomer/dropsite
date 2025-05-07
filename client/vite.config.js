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
      },
      // Might want to proxy other backend routes if added
      // '/api': {
      //   target: 'http://localhost:3000',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api/, '')
      // }
    },
  },
}); 