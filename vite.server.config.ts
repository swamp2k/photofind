import { builtinModules } from 'node:module'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> }
const dependencies = Object.keys(packageJson.dependencies ?? {})
const external = [...builtinModules, ...builtinModules.map((name) => `node:${name}`), ...dependencies]

export default defineConfig({
  build: {
    ssr: 'src/server/index.ts',
    outDir: 'out-server',
    emptyOutDir: false,
    rollupOptions: { external, output: { entryFileNames: 'index.js', format: 'es' } }
  }
})
