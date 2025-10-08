import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss(),],
  server: {
    allowedHosts: [
      'b722c9044c11.ngrok-free.app', // 👈 your ngrok domain
      'localhost'
    ],
    host: '0.0.0.0', // ensures external access works
  },
})
