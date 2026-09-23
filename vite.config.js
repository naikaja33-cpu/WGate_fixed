import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Local development config: no Base44 hosted plugin/proxy, no hosted
// authentication. The dev server proxies /api to the local Express
// backend started by `npm run dev` (see server/wgate-server.mjs).
export default defineConfig({
  logLevel: 'error',
  // For GitHub Pages (served at https://user.github.io/repo-name/), set
  // VITE_BASE_PATH=/repo-name/ when building. Defaults to '/' for local dev
  // and for hosts that serve the app at the domain root.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.WGATE_API_URL || 'http://127.0.0.1:4400',
        changeOrigin: true,
      },
    },
  },
});
