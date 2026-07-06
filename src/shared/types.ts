export type MediaKind = 'image' | 'raw' | 'video' | 'sidecar' | 'unknown'

export interface ScannedFile {
  /** Absolute path on disk */
  path: string
  /** File name including extension */
  name: string
  kind: MediaKind
  sizeBytes: number
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
