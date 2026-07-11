import type { LogEntry, PhotoFaces, ScannedFile } from '../../shared/types'
import { loadFaceEngine, type DetectedFace, type FaceEngine } from './faceEngine'

export interface FaceDetectionResult {
  items: PhotoFaces[]
  /** Full detections including embeddings — main-process only, never crosses IPC */
  detections: Map<string, DetectedFace[]>
  log: LogEntry[]
}

export interface FaceDetectionOptions {
  /** Injectable for tests; defaults to the real engine (null → feature skipped) */
  engine?: FaceEngine | null
  onProgress?: (processed: number, total: number, currentFile: string) => void
}

/**
 * Runs face detection over every image sequentially (the wasm backend is
 * single-threaded). Per-photo failures and an unavailable engine both surface
 * as explicit statuses and log entries — a scan never silently loses faces.
 */
export async function detectFaces(files: ScannedFile[], options: FaceDetectionOptions = {}): Promise<FaceDetectionResult> {
  const media = files.filter((file) => file.kind === 'image')
  const items: PhotoFaces[] = []
  const detections = new Map<string, DetectedFace[]>()
  const log: LogEntry[] = []

  const engine = options.engine !== undefined ? options.engine : await loadFaceEngine()

  if (!engine) {
    log.push({
      level: 'WARN',
      message: 'face detection unavailable (model failed to load); photos analyzed without face data',
      timestamp: Date.now()
    })
    let processed = 0
    for (const file of media) {
      items.push(skippedFaces(file.path, 'face detection unavailable'))
      processed++
      options.onProgress?.(processed, media.length, file.name)
    }
    return { items, detections, log }
  }

  let processed = 0
  for (const file of media) {
    try {
      const faces = await engine.detect(file.path)
      detections.set(file.path, faces)
      items.push({
        mediaPath: file.path,
        status: 'ok',
        count: faces.length,
        faces: faces.map(({ box, score }) => ({ box, score })),
        largestFraction: faces.reduce((max, face) => Math.max(max, face.box.width * face.box.height), 0)
      })
    } catch (err) {
      items.push({
        mediaPath: file.path,
        status: 'failed',
        reason: (err as Error).message,
        count: 0,
        faces: [],
        largestFraction: 0
      })
      log.push({
        level: 'WARN',
        message: `${file.name}: face detection failed: ${(err as Error).message}`,
        timestamp: Date.now()
      })
    }
    processed++
    options.onProgress?.(processed, media.length, file.name)
  }

  return { items, detections, log }
}

export function skippedFaces(mediaPath: string, reason: string): PhotoFaces {
  return { mediaPath, status: 'skipped', reason, count: 0, faces: [], largestFraction: 0 }
}
