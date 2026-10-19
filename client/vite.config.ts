import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/media': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/games': 'http://localhost:3000',
    },
  },
});
