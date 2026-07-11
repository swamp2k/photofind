import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import sharp from 'sharp'
import type { FaceDetection } from '../../shared/types'

export interface DetectedFace extends FaceDetection {
  embedding: Float32Array
}

export interface FaceEngine {
  detect: (filePath: string) => Promise<DetectedFace[]>
}

/** Longest side of the decoded image fed to the detector. */
const DETECT_SIZE = 640
/** Minimum detector confidence to keep a face. */
const MIN_SCORE = 0.5

let enginePromise: Promise<FaceEngine | null> | null = null
let loadedTf: TfModule | null = null

interface TfModule {
  setBackend: (name: string) => Promise<boolean>
  ready: () => Promise<void>
  tensor3d: (values: Int32Array, shape: [number, number, number], dtype: 'int32') => { dispose: () => void }
  engine: () => { reset: () => void }
}

/**
 * Lazily loads the face stack (face-api on the tfjs wasm backend, models
 * shipped inside the npm packages). Any load failure resolves to null —
 * callers surface one WARN and the scan continues without face data.
 * The promise is cached: one load attempt per process.
 */
export function loadFaceEngine(): Promise<FaceEngine | null> {
  if (!enginePromise) {
    enginePromise = initialize().catch(() => null)
  }
  return enginePromise
}

/** Test hook: forget the cached engine so failure paths can be exercised. */
export function resetFaceEngineForTests(): void {
  enginePromise = null
  loadedTf = null
}

export async function disposeFaceEngine(): Promise<void> {
  if (!enginePromise) return
  const pending = enginePromise
  enginePromise = null
  await pending.catch(() => null)
  try {
    loadedTf?.engine().reset()
  } catch {
    // Backend teardown is best-effort; the process is exiting anyway.
  }
  loadedTf = null
}

async function initialize(): Promise<FaceEngine | null> {
  // The node-wasm bundle is CJS; the main process is ESM. createRequire also
  // gives us stable on-disk paths for models and wasm binaries, which live
  // outside the asar archive in packaged builds.
  const require = createRequire(import.meta.url)
  const modelDir = unpacked(join(dirname(require.resolve('@vladmandic/face-api/package.json')), 'model'))
  const wasmDir = unpacked(join(dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json')), 'dist'))

  const tf = require('@tensorflow/tfjs') as TfModule
  const wasmBackend = require('@tensorflow/tfjs-backend-wasm') as { setWasmPaths: (prefix: string) => void }
  wasmBackend.setWasmPaths(wasmDir + sep)
  await tf.setBackend('wasm')
  await tf.ready()
  loadedTf = tf

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js') as any
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir)
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir)
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir)

  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_SCORE })

  return {
    async detect(filePath: string): Promise<DetectedFace[]> {
      const { data, info } = await sharp(filePath)
        .rotate()
        .resize({ width: DETECT_SIZE, height: DETECT_SIZE, fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const tensor = tf.tensor3d(new Int32Array(data), [info.height, info.width, 3], 'int32')
      try {
        const results = (await faceapi
          .detectAllFaces(tensor as any, options)
          .withFaceLandmarks()
          .withFaceDescriptors()) as any[]

        return results.map((result) => ({
          box: {
            x: result.detection.box.x / info.width,
            y: result.detection.box.y / info.height,
            width: result.detection.box.width / info.width,
            height: result.detection.box.height / info.height
          },
          score: result.detection.score,
          embedding: Float32Array.from(result.descriptor as Float32Array)
        }))
      } finally {
        tensor.dispose()
      }
    }
  }
}

function unpacked(path: string): string {
  // Packaged builds resolve into app.asar; models/wasm are asarUnpack'ed.
  return path.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}
