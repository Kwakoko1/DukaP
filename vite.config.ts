import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pkgPath = path.resolve(__dirname, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

const counterPath = path.resolve(__dirname, 'build-counter.json')
let buildCount = 111
try {
  if (fs.existsSync(counterPath)) {
    const data = JSON.parse(fs.readFileSync(counterPath, 'utf-8'))
    buildCount = (Number(data.buildCount) || 111) + 1
  }
} catch (e) {
  buildCount = 112
}

try {
  fs.writeFileSync(counterPath, JSON.stringify({ buildCount, updatedAt: new Date().toISOString() }, null, 2), 'utf-8')
} catch (e) {}

let commitSha = 'b5373bd'
try {
  commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
} catch (e) {
  // Graceful fallback for headless CI/CD systems
}

const now = new Date()
const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
const dynamicBuildNumber = `${dateStr}.${buildCount}`
const buildDateStr = now.toISOString().split('T')[0]

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_BUILD_NUMBER': JSON.stringify(dynamicBuildNumber),
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(commitSha),
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDateStr),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
