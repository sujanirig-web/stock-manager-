import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/stock-manager/',   // replace with your repo name if different
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0'          // allows access from other devices on same network
  }
});