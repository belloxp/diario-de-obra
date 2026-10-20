import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento, as chamadas a /api são encaminhadas para a API local (sem CORS)
    proxy: { '/api': 'http://localhost:3344' },
  },
});
