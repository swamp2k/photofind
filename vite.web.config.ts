import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const HUMAN_MODEL_FILES = ['blazeface.json', 'blazeface.bin', 'faceres.json', 'faceres.bin'] as const

function localHumanModels(): Plugin {
  let outputDirectory = resolve('dist')
  const modelsDirectory = resolve('node_modules/@vladmandic/human/models')
  return {
    name: 'photofind-local-human-models',
    configResolved(config) {
      outputDirectory = config.build.outDir
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        if (!path.startsWith('/models/')) return next()
        const fileName = path.slice('/models/'.length)
        if (!HUMAN_MODEL_FILES.includes(fileName as typeof HUMAN_MODEL_FILES[number])) {
          response.statusCode = 404
          response.end('Model asset not found')
          return
        }
        try {
          response.setHeader('Content-Type', fileName.endsWith('.json') ? 'application/json' : 'application/octet-stream')
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          response.end(readFileSync(join(modelsDirectory, fileName)))
        } catch (cause) {
          next(cause)
        }
      })
    },
    closeBundle() {
      const target = join(outputDirectory, 'models')
      mkdirSync(target, { recursive: true })
      for (const fileName of HUMAN_MODEL_FILES) copyFileSync(join(modelsDirectory, fileName), join(target, fileName))
    }
  }
}

export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react(), localHumanModels()],
  build: {
    outDir: resolve('dist'),
    emptyOutDir: true,
    sourcemap: true
  }
})
