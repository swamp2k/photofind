import { clusterPeople, type LitePeopleStateResult } from './people'
import type { LiteFaceObservation, LiteMediaRecord, LitePeopleProgress, LitePersonRecord } from './types'

export const PEOPLE_ANALYSIS_VERSION = 1
const PERSIST_BATCH_SIZE = 4

type HumanModule = typeof import('@vladmandic/human')
type HumanInstance = InstanceType<HumanModule['default']>

let humanPromise: Promise<HumanInstance> | null = null

interface PeopleAnalysisOptions {
  existingPeople: LitePersonRecord[]
  resolveFile(item: LiteMediaRecord): Promise<File | null>
  persistBatch(items: LiteMediaRecord[]): Promise<void>
  onProgress?(progress: LitePeopleProgress): void
  signal?: AbortSignal
}

export async function analyzePeople(items: LiteMediaRecord[], options: PeopleAnalysisOptions): Promise<LitePeopleStateResult> {
  const photos = items.filter((item) => item.kind === 'image')
  options.signal?.throwIfAborted()
  options.onProgress?.({ phase: 'models', complete: 0, total: photos.length, reused: 0, facesFound: 0, currentPath: 'Loading local face models…' })
  const human = await loadHuman()
  options.signal?.throwIfAborted()

  const updatedById = new Map<string, LiteMediaRecord>()
  const pending: LiteMediaRecord[] = []
  let complete = 0
  let reused = 0
  let facesFound = 0

  for (const item of photos) {
    options.signal?.throwIfAborted()
    const fingerprint = `${PEOPLE_ANALYSIS_VERSION}|${item.sizeBytes}|${item.lastModified}`
    let next: LiteMediaRecord
    if (item.faceAnalysisVersion === PEOPLE_ANALYSIS_VERSION && item.faceFingerprint === fingerprint && item.faceAnalysisStatus === 'ready') {
      next = item
      reused += 1
      facesFound += item.faces?.length ?? 0
    } else {
      next = await analyzeOne(item, fingerprint, human, options.resolveFile, options.signal)
      facesFound += next.faces?.length ?? 0
      pending.push(next)
      if (pending.length >= PERSIST_BATCH_SIZE) {
        await options.persistBatch([...pending])
        pending.length = 0
      }
    }

    updatedById.set(item.id, next)
    complete += 1
    options.onProgress?.({ phase: 'faces', complete, total: photos.length, reused, facesFound, currentPath: item.relativePath })
    await yieldToBrowser(options.signal)
  }

  if (pending.length > 0) await options.persistBatch(pending)
  options.signal?.throwIfAborted()
  const analyzedItems = items.map((item) => updatedById.get(item.id) ?? item)
  options.onProgress?.({ phase: 'clustering', complete: photos.length, total: photos.length, reused, facesFound, currentPath: 'Grouping similar faces locally…' })
  const clustered = clusterPeople(analyzedItems, options.existingPeople)
  options.signal?.throwIfAborted()
  if (clustered.changed.length > 0) await options.persistBatch(clustered.changed)
  return clustered
}

async function analyzeOne(
  item: LiteMediaRecord,
  fingerprint: string,
  human: HumanInstance,
  resolveFile: (item: LiteMediaRecord) => Promise<File | null>,
  signal?: AbortSignal
): Promise<LiteMediaRecord> {
  try {
    signal?.throwIfAborted()
    const file = await resolveFile(item)
    signal?.throwIfAborted()
    if (!file) throw new Error('Local file access is unavailable. Reconnect the source folder and retry.')
    const bitmap = await createImageBitmap(file)
    try {
      signal?.throwIfAborted()
      const previousById = new Map((item.faces ?? []).map((face) => [face.id, face]))
      const result = await human.detect(bitmap)
      signal?.throwIfAborted()
      const faces = result.face
        .filter((face) => Array.isArray(face.embedding) && face.embedding.length > 0)
        .map((face, index): LiteFaceObservation => {
          const id = faceId(index, face.boxRaw)
          const previous = previousById.get(id)
          return {
            id,
            box: normalizeBox(face.boxRaw),
            confidence: round(Math.max(0, Math.min(1, face.faceScore || face.boxScore || face.score || 0))),
            embedding: face.embedding!.map((value) => round(value)),
            ...(previous?.excludedPersonIds?.length ? { excludedPersonIds: [...previous.excludedPersonIds] } : {})
          }
        })
      return {
        ...item,
        faceAnalysisVersion: PEOPLE_ANALYSIS_VERSION,
        faceAnalysisStatus: 'ready',
        faceFingerprint: fingerprint,
        faces,
        faceAnalysisError: undefined,
        facesAnalyzedAt: Date.now()
      }
    } finally {
      bitmap.close()
    }
  } catch (cause) {
    if (isAbort(cause)) throw cause
    return {
      ...item,
      faceAnalysisVersion: PEOPLE_ANALYSIS_VERSION,
      faceAnalysisStatus: 'failed',
      faceFingerprint: fingerprint,
      faces: [],
      faceAnalysisError: messageOf(cause),
      facesAnalyzedAt: Date.now()
    }
  }
}

async function loadHuman(): Promise<HumanInstance> {
  humanPromise ??= (async () => {
    const module = await import('@vladmandic/human')
    const modelBasePath = new URL('models/', document.baseURI).href
    const human = new module.default({
      backend: 'webgl',
      modelBasePath,
      debug: false,
      async: true,
      cacheSensitivity: 0,
      face: {
        enabled: true,
        detector: {
          enabled: true,
          modelPath: 'blazeface.json',
          maxDetected: 20,
          minConfidence: 0.35,
          rotation: true
        },
        description: {
          enabled: true,
          modelPath: 'faceres.json',
          minConfidence: 0.2
        },
        mesh: { enabled: false },
        iris: { enabled: false },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
        attention: { enabled: false },
        gear: { enabled: false }
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      segmentation: { enabled: false },
      gesture: { enabled: false }
    })
    await human.load()
    return human
  })()
  return humanPromise
}

function normalizeBox(box: number[]): [number, number, number, number] {
  const [x = 0, y = 0, width = 0, height = 0] = box
  return [clamp(x), clamp(y), clamp(width), clamp(height)]
}

function faceId(index: number, box: number[]): string {
  return `face-${index}-${box.slice(0, 4).map((value) => Math.round(value * 10_000)).join('-')}`
}

function clamp(value: number): number {
  return round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)))
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
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
      reject(new DOMException('People analysis aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Unknown local face-analysis failure.'
}
