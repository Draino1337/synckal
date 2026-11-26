import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В разработке Vite (5173) проксирует WebSocket и API на сервер комнат (3000).
// В проде сервер сам раздаёт dist/.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
    },
  },
  build: { target: 'es2020' },
});
