import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss(),],
<<<<<<< HEAD
  server: {
    allowedHosts: [
      'b722c9044c11.ngrok-free.app', // 👈 your ngrok domain
      'localhost'
    ],
    host: '0.0.0.0', // ensures external access works
  },
=======
  // server: {
  //   allowedHosts: [
  //     'fadaaa0940f0.ngrok-free.app', // 👈 your ngrok domain
  //     'localhost'
  //   ],
  //   host: '0.0.0.0', // ensures external access works
  // },
>>>>>>> 79ee3b0003a831a7c7f0e08e621025a950b039fa
})
