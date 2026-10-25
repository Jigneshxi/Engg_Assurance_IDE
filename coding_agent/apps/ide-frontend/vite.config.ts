import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(frontendRoot, '../..')

// https://vite.dev/config/
export default defineConfig({
  root: frontendRoot,
  build: {
    outDir: path.resolve(repositoryRoot, 'dist'),
    emptyOutDir: true
  },
  cacheDir: path.resolve(repositoryRoot, 'node_modules/.vite'),
  plugins: [react()],
  // LLM credentials belong to the backend; the IDE frontend needs no dotenv files.
  envDir: false,
  optimizeDeps: {
    entries: ['index.html', 'src/**/*.{ts,tsx,js,jsx}']
  },
  server: {
    port: Number(process.env.OPENCLAW_FRONTEND_PORT || 5174),
    host: true,
    strictPort: false,
    proxy: {
      '/api/converge': {
        target: process.env.CONVERGE_API_URL || 'http://127.0.0.1:8000',
        changeOrigin: true
      },
      '/api': {
        target: process.env.OPENCLAW_API_URL || 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      '/health': {
        target: process.env.OPENCLAW_API_URL || 'http://127.0.0.1:3001',
        changeOrigin: true
      }
    },
    watch: {
      ignored: [
        '**/workspaces/**',
        '**/archive/**',
        '**/.openclaw/**',
        '**/server/**',
        '**/.venv/**',
        '**/test_workspace*/**',
        '**/ai/**',
        '**/docs/**',
        '**/.gemini/**',
        '**/dist/**',
        '**/other files/**',
        '**/project_test*/**',
        '**/*.zip'
      ]
    }
  }
})
