export type MediaKind = 'image' | 'raw' | 'video' | 'sidecar' | 'unknown'

export interface ScannedFile {
  /** Absolute path on disk */
  path: string
  /** File name including extension */
  name: string
  kind: MediaKind
  sizeBytes: number
  /** File modification time in epoch milliseconds; capture-time fallback when EXIF is absent */
  mtimeMs: number
}

export type MatchConfidence = 'safe' | 'uncertain' | 'missing'

export interface SidecarMatch {
  media: ScannedFile
  sidecar: ScannedFile | null
  confidence: MatchConfidence
  /** Human-readable reason, e.g. "exact filename match" or "truncated name, 2 candidates" */
  reason: string
  /** Other sidecar files that could plausibly match, when confidence is 'uncertain' */
  alternateSidecars?: ScannedFile[]
}

export interface TakeoutMetadata {
  title?: string
  description?: string
  photoTakenTime?: { timestamp: string; formatted?: string }
  geoData?: {
    latitude: number
    longitude: number
    altitude?: number
  }
  people?: { name: string }[]
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
}

export interface ScanSummary {
  totalFiles: number
  images: number
  raw: number
  videos: number
  sidecars: number
  unknown: number
  safeMatches: number
  uncertainMatches: number
  missingMatches: number
}

export interface ScanResult {
  summary: ScanSummary
  matches: SidecarMatch[]
  thumbnails: ThumbnailResult
  keepers: string[]
  log: LogEntry[]
}

export interface RepairResult {
  attempted: number
  repaired: number
  failed: number
  log: LogEntry[]
}

export interface ExportedFile {
  sourcePath: string
  outputPath: string | null
  status: 'exported' | 'failed'
  reason?: string
}

export interface ExportResult {
  attempted: number
  exported: number
  failed: number
  destinationRoot: string
  reportPath: string
  files: ExportedFile[]
  log: LogEntry[]
}

export type CaptureTimeSource = 'exif' | 'mtime' | 'unknown'

export interface GpsCoordinates {
  /** Signed decimal degrees, south/west negative */
  lat: number
  lon: number
}

export interface CaptureMetadata {
  mediaPath: string
  /** Epoch milliseconds of the moment the photo was taken, or null when unknown */
  captureTimeMs: number | null
  source: CaptureTimeSource
  cameraModel: string | null
  width: number | null
  height: number | null
  gps: GpsCoordinates | null
  status: 'ok' | 'failed'
  reason?: string
}

export interface QualityScore {
  mediaPath: string
  /** Laplacian variance of the grayscale thumbnail; higher is sharper */
  sharpness: number | null
  /** Mean luma 0-255 */
  exposureMean: number | null
  /** Fraction (0-1) of pixels with luma < 10 */
  clippedShadowsPct: number | null
  /** Fraction (0-1) of pixels with luma > 245 */
  clippedHighlightsPct: number | null
  status: 'ok' | 'failed'
  reason?: string
}

export type Verdict = 'keep' | 'maybe' | 'discard'

export interface PhotoAnalysis {
  media: ScannedFile
  capture: CaptureMetadata
  quality: QualityScore
  burstId: string | null
  burstSize: number
  isBurstPick: boolean
  suggestedVerdict: Verdict
  /** Human-readable reasons behind the suggestion, e.g. "blurry", "best of burst of 5" */
  reasons: string[]
  /** User override; null means the suggestion stands */
  userVerdict: Verdict | null
}

export interface BurstGroup {
  id: string
  mediaPaths: string[]
  pickPath: string
  startMs: number
  endMs: number
}

export interface CurateSummary {
  totalFiles: number
  analyzed: number
  keep: number
  maybe: number
  discard: number
  bursts: number
  failed: number
}

export interface CurateScanResult {
  scanId: string
  rootPath: string
  summary: CurateSummary
  photos: PhotoAnalysis[]
  bursts: BurstGroup[]
  thumbnails: ThumbnailResult
  log: LogEntry[]
}

export type ScanPhase = 'scanning' | 'metadata' | 'thumbnails' | 'analyzing' | 'grouping' | 'done'

export interface ScanProgressEvent {
  scanId: string
  phase: ScanPhase
  processed: number
  total: number
  currentFile?: string
}

export type ThumbnailStatus = 'ready' | 'failed' | 'skipped'

export interface MediaThumbnail {
  mediaPath: string
  thumbnailPath: string | null
  thumbnailUrl: string | null
  status: ThumbnailStatus
  reason?: string
  width?: number
  height?: number
}

export interface ThumbnailResult {
  generated: number
  reused: number
  failed: number
  skipped: number
  items: MediaThumbnail[]
  log: LogEntry[]
}
