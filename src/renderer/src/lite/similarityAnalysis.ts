import type { LiteMediaRecord, LiteSimilarityProgress } from './types'

export const LITE_SIMILARITY_VERSION = 1
const PERSIST_BATCH_SIZE = 20

interface WorkerResult {
  id: string
  contentHash?: string
  perceptualHash?: string
  error?: string
}

interface AnalysisOptions {
  resolveFile(item: LiteMediaRecord): Promise<File | null>
  onProgress?(progress: LiteSimilarityProgress): void
  persistBatch?(records: LiteMediaRecord[]): Promise<void>
}

export async function analyzeSimilarity(
  records: LiteMediaRecord[],
  options: AnalysisOptions
): Promise<LiteMediaRecord[]> {
  const targets = records.filter((item) => item.kind === 'image')
  const updates = new Map<string, LiteMediaRecord>()
  const pendingPersist: LiteMediaRecord[] = []
  let complete = 0
  let reused = 0
  const worker = new Worker(new URL('./similarity.worker.ts', import.meta.url), { type: 'module' })

  try {
    for (const item of targets) {
      const fingerprint = similarityFingerprint(item)
      if (isReusable(item, fingerprint)) {
        updates.set(item.id, item)
        complete += 1
        reused += 1
        options.onProgress?.({ complete, total: targets.length, reused, currentPath: item.relativePath })
        continue
      }

      const file = await options.resolveFile(item)
      let updated: LiteMediaRecord
      if (!file) {
        updated = failedRecord(item, fingerprint, 'Local file access is unavailable. Reconnect the source folder and retry.')
      } else {
        const result = await analyzeFile(worker, item.id, file)
        updated = applyWorkerResult(item, fingerprint, result)
      }

      updates.set(item.id, updated)
      pendingPersist.push(updated)
      complete += 1
      options.onProgress?.({ complete, total: targets.length, reused, currentPath: item.relativePath })

      if (pendingPersist.length >= PERSIST_BATCH_SIZE) await flushPending(options.persistBatch, pendingPersist)
      await Promise.resolve()
    }
    await flushPending(options.persistBatch, pendingPersist)
  } finally {
    worker.terminate()
  }

  return records.map((item) => updates.get(item.id) ?? item)
}

function isReusable(item: LiteMediaRecord, fingerprint: string): boolean {
  return item.similarityVersion === LITE_SIMILARITY_VERSION
    && item.similarityStatus === 'ready'
    && item.similarityFingerprint === fingerprint
    && typeof item.contentHash === 'string'
}

function similarityFingerprint(item: LiteMediaRecord): string {
  return `${item.sizeBytes}|${item.lastModified}`
}

function applyWorkerResult(item: LiteMediaRecord, fingerprint: string, result: WorkerResult): LiteMediaRecord {
  if (!result.contentHash) return failedRecord(item, fingerprint, result.error ?? 'Hash analysis failed.')
  return {
    ...item,
    similarityVersion: LITE_SIMILARITY_VERSION,
    similarityStatus: 'ready',
    similarityFingerprint: fingerprint,
    contentHash: result.contentHash,
    ...(result.perceptualHash ? { perceptualHash: result.perceptualHash } : { perceptualHash: undefined }),
    ...(result.error ? { similarityError: result.error } : { similarityError: undefined }),
    similarityAnalyzedAt: Date.now()
  }
}

function failedRecord(item: LiteMediaRecord, fingerprint: string, error: string): LiteMediaRecord {
  return {
    ...item,
    similarityVersion: LITE_SIMILARITY_VERSION,
    similarityStatus: 'failed',
    similarityFingerprint: fingerprint,
    contentHash: undefined,
    perceptualHash: undefined,
    similarityError: error,
    similarityAnalyzedAt: Date.now()
  }
}

function analyzeFile(worker: Worker, id: string, file: File): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<WorkerResult>): void => {
      if (event.data.id !== id) return
      cleanup()
      resolve(event.data)
    }
    const onError = (event: ErrorEvent): void => {
      cleanup()
      resolve({ id, error: event.message || 'Similarity worker failed.' })
    }
    const cleanup = (): void => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.postMessage({ id, file })
  })
}

async function flushPending(
  persistBatch: AnalysisOptions['persistBatch'],
  pending: LiteMediaRecord[]
): Promise<void> {
  if (pending.length === 0) return
  const batch = pending.splice(0, pending.length)
  if (persistBatch) await persistBatch(batch)
}
