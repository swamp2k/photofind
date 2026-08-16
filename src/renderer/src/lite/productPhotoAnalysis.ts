import { decodeBitmapForAnalysis } from './imageDecode'
import type { LiteMediaRecord } from './types'

export const PRODUCT_ANALYSIS_VERSION = 1
export const PRODUCT_MODEL_ID = 'Xenova/mobileclip_s0'
const PROMPT_SET_VERSION = 1
const PERSIST_BATCH_SIZE = 4
const MAX_ANALYSIS_DIMENSION = 768

export const PRODUCT_POSITIVE_PROMPTS = [
  'a used item photographed for an online marketplace sale',
  'a product listing photo with one item as the main subject',
  'clothing or shoes displayed for sale',
  'electronics or a household item photographed for sale',
  'a bicycle, tool, toy, or piece of equipment photographed for sale'
] as const

export const PRODUCT_NEGATIVE_PROMPTS = [
  'a family snapshot with people',
  'a child playing or posing for a photo',
  'people eating, visiting, or spending time together',
  'a travel, landscape, nature, or outdoor memory photo',
  'a casual everyday photo of home life rather than an item for sale'
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

type TransformersModule = typeof import('@huggingface/transformers')
type ProductClassifier = Awaited<ReturnType<TransformersModule['pipeline']>>

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
      const rawOutput = await classifier(image, CANDIDATE_PROMPTS, { hypothesis_template: '{}' })
      signal?.throwIfAborted()
      const predictions = rawOutput as SemanticPrediction[]
      const productScore = round(predictions.reduce((sum, prediction) => sum + (POSITIVE_PROMPTS.has(prediction.label) ? prediction.score : 0), 0))
      const positive = predictions.filter((prediction) => POSITIVE_PROMPTS.has(prediction.label)).sort((left, right) => right.score - left.score)[0]
      const negative = predictions.filter((prediction) => !POSITIVE_PROMPTS.has(prediction.label)).sort((left, right) => right.score - left.score)[0]

      return {
        ...item,
        productAnalysisVersion: PRODUCT_ANALYSIS_VERSION,
        productAnalysisStatus: 'ready',
        productAnalysisFingerprint: fingerprint,
        productSemanticScore: productScore,
        productSemanticLabel: positive?.label,
        productSemanticNegativeLabel: negative?.label,
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
  classifierPromise ??= (async () => {
    const module = await import('@huggingface/transformers')
    module.env.allowLocalModels = false
    module.env.allowRemoteModels = true
    module.env.useBrowserCache = true

    const device = supportsWebGpu() ? 'webgpu' : 'wasm'
    try {
      return await module.pipeline('zero-shot-image-classification', PRODUCT_MODEL_ID, { device, dtype: 'q8' })
    } catch (cause) {
      if (device === 'wasm') throw cause
      return module.pipeline('zero-shot-image-classification', PRODUCT_MODEL_ID, { device: 'wasm', dtype: 'q8' })
    }
  })()
  return classifierPromise
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

function supportsWebGpu(): boolean {
  return Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
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
