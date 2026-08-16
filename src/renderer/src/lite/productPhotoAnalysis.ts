import { decodeBitmapForAnalysis } from './imageDecode'
import type { LiteMediaRecord } from './types'

export const PRODUCT_ANALYSIS_VERSION = 1
export const PRODUCT_MODEL_ID = 'Xenova/siglip-base-patch16-224'
const PRODUCT_MODEL_REVISION = 'main'
const PROMPT_SET_VERSION = 1
const PERSIST_BATCH_SIZE = 4
const MAX_ANALYSIS_DIMENSION = 768

export const PRODUCT_POSITIVE_PROMPTS = [
  'a used item listed for sale online',
  'a marketplace product listing',
  'clothing or shoes displayed for sale',
  'electronics or a household item displayed for sale',
  'a bicycle, tool, toy, or piece of equipment displayed for sale'
] as const

export const PRODUCT_NEGATIVE_PROMPTS = [
  'a family snapshot with people',
  'a child playing or posing',
  'people eating, visiting, or spending time together',
  'a travel, landscape, nature, or outdoor memory',
  'casual everyday home life rather than an item for sale'
] as const

const CANDIDATE_PROMPTS = [...PRODUCT_POSITIVE_PROMPTS, ...PRODUCT_NEGATIVE_PROMPTS]
const POSITIVE_PROMPTS = new Set<string>(PRODUCT_POSITIVE_PROMPTS)

type ProductAnalysisPhase = 'model' | 'photos'

export interface LiteProductAnalysisProgress {
  phase: ProductAnalysisPhase
  complete: number
  total: number
  reused: number
  failed: number
  currentPath: string
}

interface ProductAnalysisOptions {
  resolveFile(item: LiteMediaRecord): Promise<File | null>
  persistBatch(items: LiteMediaRecord[]): Promise<void>
  onProgress?(progress: LiteProductAnalysisProgress): void
  signal?: AbortSignal
}

interface SemanticPrediction {
  label: string
  score: number
}

interface ProductClassifier {
  (image: unknown, candidateLabels: readonly string[]): Promise<SemanticPrediction[]>
}

let classifierPromise: Promise<ProductClassifier> | null = null

export async function analyzeProductPhotos(items: LiteMediaRecord[], options: ProductAnalysisOptions): Promise<LiteMediaRecord[]> {
  const photos = items.filter((item) => item.kind === 'image')
  options.signal?.throwIfAborted()
  options.onProgress?.({ phase: 'model', complete: 0, total: photos.length, reused: 0, failed: 0, currentPath: 'Loading semantic image model…' })
  const classifier = await loadClassifier()
  options.signal?.throwIfAborted()

  const updatedById = new Map<string, LiteMediaRecord>()
  const pending: LiteMediaRecord[] = []
  let complete = 0
  let reused = 0
  let failed = 0

  for (const item of photos) {
    options.signal?.throwIfAborted()
    const fingerprint = analysisFingerprint(item)
    let next: LiteMediaRecord
    if (
      item.productAnalysisVersion === PRODUCT_ANALYSIS_VERSION
      && item.productAnalysisFingerprint === fingerprint
      && item.productAnalysisStatus === 'ready'
    ) {
      next = item
      reused += 1
    } else {
      next = await analyzeOne(item, fingerprint, classifier, options.resolveFile, options.signal)
      if (next.productAnalysisStatus === 'failed') failed += 1
      pending.push(next)
      if (pending.length >= PERSIST_BATCH_SIZE) {
        await options.persistBatch([...pending])
        pending.length = 0
      }
    }

    updatedById.set(item.id, next)
    complete += 1
    options.onProgress?.({ phase: 'photos', complete, total: photos.length, reused, failed, currentPath: item.relativePath })
    await yieldToBrowser(options.signal)
  }

  if (pending.length > 0) await options.persistBatch(pending)
  return items.map((item) => updatedById.get(item.id) ?? item)
}

async function analyzeOne(
  item: LiteMediaRecord,
  fingerprint: string,
  classifier: ProductClassifier,
  resolveFile: (item: LiteMediaRecord) => Promise<File | null>,
  signal?: AbortSignal
): Promise<LiteMediaRecord> {
  try {
    signal?.throwIfAborted()
    const file = await resolveFile(item)
    signal?.throwIfAborted()
    if (!file) throw new Error('Local file access is unavailable. Reconnect the source folder and retry.')

    const bitmap = await decodeBitmapForAnalysis(file, item, MAX_ANALYSIS_DIMENSION)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is unavailable for semantic image analysis.')
      context.drawImage(bitmap, 0, 0)

      const module = await import('@huggingface/transformers')
      const image = module.RawImage.fromCanvas(canvas)
      signal?.throwIfAborted()
      const predictions = await classifier(image, CANDIDATE_PROMPTS)
      signal?.throwIfAborted()

      const positives = predictions
        .filter((prediction) => POSITIVE_PROMPTS.has(prediction.label))
        .sort((left, right) => right.score - left.score)
      const negatives = predictions
        .filter((prediction) => !POSITIVE_PROMPTS.has(prediction.label))
        .sort((left, right) => right.score - left.score)
      const positiveEvidence = topEvidence(positives)
      const negativeEvidence = topEvidence(negatives)
      const evidenceTotal = positiveEvidence + negativeEvidence
      const productScore = round(evidenceTotal > 0 ? positiveEvidence / evidenceTotal : 0.5)

      return {
        ...item,
        productAnalysisVersion: PRODUCT_ANALYSIS_VERSION,
        productAnalysisStatus: 'ready',
        productAnalysisFingerprint: fingerprint,
        productSemanticScore: productScore,
        productSemanticLabel: positives[0]?.label,
        productSemanticNegativeLabel: negatives[0]?.label,
        productAnalysisError: undefined,
        productAnalyzedAt: Date.now()
      }
    } finally {
      bitmap.close()
    }
  } catch (cause) {
    if (isAbort(cause)) throw cause
    return {
      ...item,
      productAnalysisVersion: PRODUCT_ANALYSIS_VERSION,
      productAnalysisStatus: 'failed',
      productAnalysisFingerprint: fingerprint,
      productSemanticScore: undefined,
      productSemanticLabel: undefined,
      productSemanticNegativeLabel: undefined,
      productAnalysisError: messageOf(cause),
      productAnalyzedAt: Date.now()
    }
  }
}

async function loadClassifier(): Promise<ProductClassifier> {
  if (!classifierPromise) {
    classifierPromise = createClassifier().catch((cause) => {
      classifierPromise = null
      throw cause
    })
  }
  return classifierPromise
}

async function createClassifier(): Promise<ProductClassifier> {
  const module = await import('@huggingface/transformers')
  module.env.allowLocalModels = false
  module.env.allowRemoteModels = true
  module.env.useBrowserCache = true
  const wasmBackend = module.env.backends.onnx.wasm
  if (!wasmBackend) throw new Error('Transformers.js did not expose the ONNX WASM runtime configuration.')
  wasmBackend.wasmPaths = new URL('/onnx-wasm/', window.location.origin).href

  if (isLocalDevelopment()) {
    module.env.remoteHost = 'https://huggingface.co/'
    module.env.remotePathTemplate = '{model}/resolve/{revision}/'
  } else {
    await verifyModelGateway()
    module.env.remoteHost = new URL('/api/hf-models/', window.location.origin).href
    module.env.remotePathTemplate = '{model}/resolve/{revision}/'
  }

  const device = supportsWebGpu() ? 'webgpu' : 'wasm'
  try {
    const classifier = await module.pipeline('zero-shot-image-classification', PRODUCT_MODEL_ID, {
      revision: PRODUCT_MODEL_REVISION,
      device,
      dtype: 'q8'
    })
    return classifier as unknown as ProductClassifier
  } catch (cause) {
    if (device === 'wasm') throw new Error(`Semantic model failed to load with local WASM runtime: ${messageOf(cause)}`)
    try {
      const classifier = await module.pipeline('zero-shot-image-classification', PRODUCT_MODEL_ID, {
        revision: PRODUCT_MODEL_REVISION,
        device: 'wasm',
        dtype: 'q8'
      })
      return classifier as unknown as ProductClassifier
    } catch (fallbackCause) {
      throw new Error(`Semantic model failed on WebGPU and local WASM fallback. WebGPU: ${messageOf(cause)} WASM: ${messageOf(fallbackCause)}`)
    }
  }
}

async function verifyModelGateway(): Promise<void> {
  const url = new URL(`/api/hf-models/${PRODUCT_MODEL_ID}/resolve/${PRODUCT_MODEL_REVISION}/config.json`, window.location.origin)
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  } catch (cause) {
    throw new Error(`PhotoFind model gateway could not be reached: ${messageOf(cause)}`)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`PhotoFind model gateway returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`)
  }
}

export function productAnalysisIsCurrent(item: LiteMediaRecord): boolean {
  return item.productAnalysisVersion === PRODUCT_ANALYSIS_VERSION
    && item.productAnalysisFingerprint === analysisFingerprint(item)
    && item.productAnalysisStatus === 'ready'
    && typeof item.productSemanticScore === 'number'
}

function analysisFingerprint(item: LiteMediaRecord): string {
  return `${PRODUCT_ANALYSIS_VERSION}|${PROMPT_SET_VERSION}|${PRODUCT_MODEL_ID}|${item.sizeBytes}|${item.lastModified}`
}

function topEvidence(predictions: SemanticPrediction[]): number {
  if (predictions.length === 0) return 0
  const top = predictions.slice(0, 2)
  return top.reduce((sum, prediction) => sum + prediction.score, 0) / top.length
}

function supportsWebGpu(): boolean {
  return Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
}

function isLocalDevelopment(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '[::1]'
}

function round(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000
}

function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, 0)
    const onAbort = (): void => {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Product-photo analysis aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Unknown semantic image-analysis failure.'
}
