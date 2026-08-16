import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const HUMAN_MODEL_FILES = ['blazeface.json', 'blazeface.bin', 'faceres.json', 'faceres.bin'] as const
const ONNX_RUNTIME_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm'
] as const

function localModelAssets(): Plugin {
  let outputDirectory = resolve('dist')
  const humanModelsDirectory = resolve('node_modules/@vladmandic/human/models')
  return {
    name: 'photofind-local-model-assets',
    configResolved(config) {
      outputDirectory = config.build.outDir
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        if (path.startsWith('/models/')) {
          const fileName = path.slice('/models/'.length)
          if (!HUMAN_MODEL_FILES.includes(fileName as typeof HUMAN_MODEL_FILES[number])) {
            response.statusCode = 404
            response.end('Model asset not found')
            return
          }
          try {
            response.setHeader('Content-Type', fileName.endsWith('.json') ? 'application/json' : 'application/octet-stream')
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            response.end(readFileSync(join(humanModelsDirectory, fileName)))
          } catch (cause) {
            next(cause)
          }
          return
        }

        if (path.startsWith('/onnx-wasm/')) {
          const fileName = path.slice('/onnx-wasm/'.length)
          if (!ONNX_RUNTIME_FILES.includes(fileName as typeof ONNX_RUNTIME_FILES[number])) {
            response.statusCode = 404
            response.end('ONNX runtime asset not found')
            return
          }
          try {
            response.setHeader('Content-Type', fileName.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8')
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            response.end(readFileSync(resolveOnnxRuntimeFile(fileName)))
          } catch (cause) {
            next(cause)
          }
          return
        }

        next()
      })
    },
    closeBundle() {
      const humanTarget = join(outputDirectory, 'models')
      mkdirSync(humanTarget, { recursive: true })
      for (const fileName of HUMAN_MODEL_FILES) copyFileSync(join(humanModelsDirectory, fileName), join(humanTarget, fileName))

      const onnxTarget = join(outputDirectory, 'onnx-wasm')
      mkdirSync(onnxTarget, { recursive: true })
      for (const fileName of ONNX_RUNTIME_FILES) copyFileSync(resolveOnnxRuntimeFile(fileName), join(onnxTarget, fileName))
    }
  }
}

function resolveOnnxRuntimeFile(fileName: typeof ONNX_RUNTIME_FILES[number]): string {
  const candidates = [
    resolve('node_modules/@huggingface/transformers/dist', fileName),
    resolve('node_modules/onnxruntime-web/dist', fileName),
    resolve('node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist', fileName)
  ]
  const match = candidates.find(existsSync)
  if (!match) throw new Error(`Required ONNX runtime asset is missing: ${fileName}`)
  return match
}

export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react(), localModelAssets()],
  build: {
    outDir: resolve('dist'),
    emptyOutDir: true,
    sourcemap: true
  }
})
