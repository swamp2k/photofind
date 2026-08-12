import { scoreQuality } from './quality'
import type { LiteMediaRecord, LiteQualityMeasurements, LiteQualityProgress } from './types'

export const LITE_QUALITY_VERSION = 1
const PERSIST_BATCH_SIZE = 16

interface WorkerResult {
  id: string
  measurements?: LiteQualityMeasurements
  error?: string
}

interface QualityAnalysisOptions {
  resolveFile(item: LiteMediaRecord): Promise<File | null>
  onProgress?(progress: LiteQualityProgress): void
  persistBatch?(records: LiteMediaRecord[]): Promise<void>
  signal?: AbortSignal
}

export async function analyzeQuality(
  records: LiteMediaRecord[],
  options: QualityAnalysisOptions
): Promise<LiteMediaRecord[]> {
  const targets = records.filter((item) => item.kind === 'image')
  const updates = new Map<string, LiteMediaRecord>()
  const pendingPersist: LiteMediaRecord[] = []
  let complete = 0
  let reused = 0
  const worker = new Worker(new URL('./quality.worker.ts', import.meta.url), { type: 'module' })

  try {
    for (const item of targets) {
      options.signal?.throwIfAborted()
      const fingerprint = qualityFingerprint(item)
      if (isReusable(item, fingerprint)) {
        updates.set(item.id, item)
        complete += 1
        reused += 1
        options.onProgress?.({ complete, total: targets.length, reused, currentPath: item.relativePath })
        continue
      }

      const file = await options.resolveFile(item)
      options.signal?.throwIfAborted()
      let updated: LiteMediaRecord
      if (!file) {
        updated = failedRecord(item, fingerprint, 'Local file access is unavailable. Reconnect the source folder and retry.')
      } else {
        const result = await analyzeFile(worker, item.id, file, options.signal)
        updated = applyWorkerResult(item, fingerprint, result)
      }

      updates.set(item.id, updated)
      pendingPersist.push(updated)
      complete += 1
      options.onProgress?.({ complete, total: targets.length, reused, currentPath: item.relativePath })

      if (pendingPersist.length >= PERSIST_BATCH_SIZE) await flushPending(options.persistBatch, pendingPersist)
      options.signal?.throwIfAborted()
      await Promise.resolve()
    }
    await flushPending(options.persistBatch, pendingPersist)
    options.signal?.throwIfAborted()
  } finally {
    worker.terminate()
  }

  return records.map((item) => updates.get(item.id) ?? item)
}

function isReusable(item: LiteMediaRecord, fingerprint: string): boolean {
  return item.qualityVersion === LITE_QUALITY_VERSION
    && item.qualityStatus === 'ready'
    && item.qualityFingerprint === fingerprint
    && typeof item.qualityScore === 'number'
}

function qualityFingerprint(item: LiteMediaRecord): string {
  return `${item.sizeBytes}|${item.lastModified}`
}

function applyWorkerResult(item: LiteMediaRecord, fingerprint: string, result: WorkerResult): LiteMediaRecord {
  if (!result.measurements) return failedRecord(item, fingerprint, result.error ?? 'Image quality analysis failed.')
  const measurements = result.measurements
  const score = scoreQuality(measurements)
  return {
    ...item,
    width: item.width ?? measurements.width,
    height: item.height ?? measurements.height,
    qualityVersion: LITE_QUALITY_VERSION,
    qualityStatus: 'ready',
    qualityFingerprint: fingerprint,
    qualityScore: score.qualityScore,
    qualityTier: score.qualityTier,
    sharpnessScore: score.sharpnessScore,
    exposureScore: score.exposureScore,
    resolutionScore: score.resolutionScore,
    motionBlurRisk: score.motionBlurRisk,
    meanLuminance: measurements.meanLuminance,
    luminanceStdDev: measurements.luminanceStdDev,
    shadowClipFraction: measurements.shadowClipFraction,
    highlightClipFraction: measurements.highlightClipFraction,
    laplacianMeanAbs: measurements.laplacianMeanAbs,
    horizontalGradient: measurements.horizontalGradient,
    verticalGradient: measurements.verticalGradient,
    qualityReasons: score.qualityReasons,
    qualityError: undefined,
    qualityAnalyzedAt: Date.now()
  }
}

function failedRecord(item: LiteMediaRecord, fingerprint: string, error: string): LiteMediaRecord {
  return {
    ...item,
    qualityVersion: LITE_QUALITY_VERSION,
    qualityStatus: 'failed',
    qualityFingerprint: fingerprint,
    qualityScore: undefined,
    qualityTier: undefined,
    sharpnessScore: undefined,
    exposureScore: undefined,
    resolutionScore: undefined,
    motionBlurRisk: undefined,
    qualityReasons: undefined,
    qualityError: error,
    qualityAnalyzedAt: Date.now()
  }
}

function analyzeFile(worker: Worker, id: string, file: File, signal?: AbortSignal): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerResult>): void => {
      if (event.data.id !== id) return
      cleanup()
      resolve(event.data)
    }
    const onError = (event: ErrorEvent): void => {
      cleanup()
      resolve({ id, error: event.message || 'Quality worker failed.' })
    }
    const onAbort = (): void => {
      cleanup()
      reject(new DOMException('Quality analysis aborted.', 'AbortError'))
    }
    const cleanup = (): void => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) return onAbort()
    worker.postMessage({ id, file })
  })
}

async function flushPending(
  persistBatch: QualityAnalysisOptions['persistBatch'],
  pending: LiteMediaRecord[]
): Promise<void> {
  if (pending.length === 0) return
  const batch = pending.splice(0, pending.length)
  if (persistBatch) await persistBatch(batch)
}
