export type LiteMediaKind = 'image' | 'raw' | 'video' | 'sidecar' | 'unknown'
export type LiteLibraryAccessMode = 'handle' | 'selection'
export type LiteCaptureTimeSource = 'takeout' | 'exif' | 'file'
export type LiteLocationSource = 'takeout' | 'exif'
export type LiteMetadataStatus = 'parsed' | 'reused' | 'not-applicable' | 'failed'
export type LiteTakeoutMatchConfidence = 'safe' | 'uncertain' | 'missing'
export type LiteSimilarityStatus = 'ready' | 'failed'
export type LiteSimilarityGroupKind = 'exact' | 'burst' | 'similar'
export type LiteQualityStatus = 'ready' | 'failed'
export type LiteQualityTier = 'great' | 'good' | 'okay' | 'weak'
export type LiteReviewState = 'unreviewed' | 'keep' | 'maybe' | 'reject'
export type LiteReviewFilter = 'all' | LiteReviewState
export type LiteExportLayout = 'flat' | 'date-day' | 'date-month' | 'source-folders'

export interface LiteMediaRecord {
  id: string
  libraryId: string
  relativePath: string
  name: string
  kind: LiteMediaKind
  sizeBytes: number
  lastModified: number
  mimeType: string
  fileHandle?: FileSystemFileHandle
  metadataVersion?: number
  metadataStatus?: LiteMetadataStatus
  effectiveCaptureTime?: number
  captureTimeSource?: LiteCaptureTimeSource
  latitude?: number
  longitude?: number
  locationSource?: LiteLocationSource
  width?: number
  height?: number
  cameraMake?: string
  cameraModel?: string
  takeoutSidecarPath?: string
  takeoutMatchConfidence?: LiteTakeoutMatchConfidence
  sidecarFingerprint?: string
  diagnostics?: string[]
  similarityVersion?: number
  similarityStatus?: LiteSimilarityStatus
  contentHash?: string
  perceptualHash?: string
  similarityFingerprint?: string
  similarityError?: string
  similarityAnalyzedAt?: number
  qualityVersion?: number
  qualityStatus?: LiteQualityStatus
  qualityFingerprint?: string
  qualityScore?: number
  qualityTier?: LiteQualityTier
  sharpnessScore?: number
  exposureScore?: number
  resolutionScore?: number
  motionBlurRisk?: number
  meanLuminance?: number
  luminanceStdDev?: number
  shadowClipFraction?: number
  highlightClipFraction?: number
  laplacianMeanAbs?: number
  horizontalGradient?: number
  verticalGradient?: number
  qualityReasons?: string[]
  qualityError?: string
  qualityAnalyzedAt?: number
  reviewState?: LiteReviewState
  reviewUpdatedAt?: number
}

export interface LiteLibraryRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  fileCount: number
  imageCount: number
  rawCount: number
  videoCount: number
  sidecarCount: number
  unknownCount: number
  locatedCount?: number
  accessMode: LiteLibraryAccessMode
  rootHandle?: FileSystemDirectoryHandle
}

export type LiteScanPhase = 'files' | 'metadata'

export interface LiteScanProgress {
  phase?: LiteScanPhase
  scannedFiles: number
  currentPath: string
  metadataParsed?: number
  metadataReused?: number
  metadataTotal?: number
}

export interface LiteScanResult {
  library: LiteLibraryRecord
  media: LiteMediaRecord[]
}

export interface LiteSelectionScanResult extends LiteScanResult {
  sessionFiles: Map<string, File>
}

export interface LiteGeoBounds {
  west: number
  south: number
  east: number
  north: number
}

export type LiteLocationFilter = 'all' | 'located' | 'missing'
export type LiteDateMetadataFilter = 'all' | 'captured' | 'file-only'

export interface LitePhotoFilters {
  year: number | null
  fromTime: number | null
  toTime: number | null
  location: LiteLocationFilter
  dateMetadata: LiteDateMetadataFilter
  mapBounds: LiteGeoBounds | null
}

export interface LiteSimilarityProgress {
  complete: number
  total: number
  reused: number
  currentPath: string
}

export interface LiteSimilarityGroup {
  id: string
  kind: LiteSimilarityGroupKind
  itemIds: string[]
  reason: string
  maxPerceptualDistance?: number
  timeSpanMs?: number
}

export interface LiteQualityProgress {
  complete: number
  total: number
  reused: number
  currentPath: string
}

export interface LiteQualityMeasurements {
  width: number
  height: number
  meanLuminance: number
  luminanceStdDev: number
  shadowClipFraction: number
  highlightClipFraction: number
  laplacianMeanAbs: number
  horizontalGradient: number
  verticalGradient: number
}

export interface LiteReviewCounts {
  unreviewed: number
  keep: number
  maybe: number
  reject: number
}

export interface LiteExportProgress {
  complete: number
  total: number
  exported: number
  renamed: number
  failed: number
  metadataEmbedded: number
  sidecarsWritten: number
  currentPath: string
}

export interface LiteExportFailure {
  itemId: string
  relativePath: string
  message: string
}

export interface LiteExportResult {
  exported: number
  renamed: number
  metadataEmbedded: number
  sidecarsWritten: number
  metadataUnchanged: number
  failures: LiteExportFailure[]
  manifestPath?: string
  reportPath?: string
}
