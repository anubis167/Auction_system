import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.FE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      // chat-1.2: be/chat.py; listed first so it wins over /api. 127.0.0.1 because Flask does not listen on ::1.
      '/api/chat': process.env.CHAT_URL ?? 'http://127.0.0.1:5000',
      '/api/docs': process.env.CHAT_URL ?? 'http://127.0.0.1:5000', // rag-1.4: knowledge documents, also be/chat.py
      '/api': process.env.API_URL ?? 'http://localhost:4000',
      '/uploads': process.env.API_URL ?? 'http://localhost:4000',
    },
  },
});
