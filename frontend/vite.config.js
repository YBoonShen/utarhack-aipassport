import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // listen on the LAN so phones on the same Wi-Fi can open the app
    host: true,
    proxy: {
      // forward API calls to the backend during development
      '/api': 'http://localhost:5001'
    }
  }
})
