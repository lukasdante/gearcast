import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Dev: /api is proxied to the Cloudflare Worker (`cd worker && npx wrangler dev`, port 8787).
// To use the Python reference backend instead, point it at 'http://127.0.0.1:8000'
// (`cd backend && uv run uvicorn gearcast_backend.main:app --port 8000`; it has no login, so sign-in will not work there).
export default defineConfig({
  plugins: [react()],
  // fs.allow: the incident document renderer is shared with the Worker (../worker/src/doc).
  server: { proxy: { '/api': 'http://127.0.0.1:8787' }, fs: { allow: ['..'] } },
})
