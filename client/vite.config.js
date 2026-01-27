import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow external connections in Docker
    port: 3000,
    watch: {
      usePolling: true, // Enable polling for Docker volume mounts
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Browser connects to localhost, which maps to host
        changeOrigin: true
      }
    }
  }
})
