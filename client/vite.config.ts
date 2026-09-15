import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    // Dev proxy so the client can use relative /api and /snapshots URLs
    // while Vite (5173) forwards them to the backend (5000).
    proxy: {
      '/api': 'http://localhost:5000',
      '/snapshots': 'http://localhost:5000',
    },
  },
})