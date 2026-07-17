import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'https://api-production-95c7.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/admin': {
        target: 'https://api-production-95c7.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/ws': {
        target: 'wss://api-production-95c7.up.railway.app',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
