import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss(),],
  server: {
    allowedHosts: [
      'fadaaa0940f0.ngrok-free.app', // 👈 your ngrok domain
      'localhost'
    ],
    host: '0.0.0.0', // ensures external access works
  },
})
