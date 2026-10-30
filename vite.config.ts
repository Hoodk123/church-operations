import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev only: the API runs on 127.0.0.1:3100 (default API_PORT); prod serves
    // everything same-origin behind the builder (Phase 5/6). [local-first]
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3100",
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    }
  }
})
