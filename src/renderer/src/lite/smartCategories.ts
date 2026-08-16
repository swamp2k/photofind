import { classifyLikelyNonPhoto } from './contentClassification'
import type {
  LiteMediaRecord,
  LiteProductPhotoSettings,
  LiteSimilarityGroup,
  LiteSmartCategorySettings,
  LiteSmartCategorySensitivity
} from './types'

export const DEFAULT_SMART_CATEGORY_SETTINGS: LiteSmartCategorySettings = {
  productPhotos: {
    sensitivity: 'balanced',
    recognizeSeries: true,
    preferNoPeople: true
  }
}

export interface LiteProductPhotoMatch {
  item: LiteMediaRecord
  score: number
  reasons: string[]
  seriesSize: number
  manuallyIncluded: boolean
}

interface SimilaritySignal {
  strength: number
  size: number
  label: string
}

const PRODUCT_PATH_HINT = /(?:^|[\\/\s_.-])(product|products|sale|selling|marketplace|dba|til[\s_-]?salg|for[\s_-]?sale)(?:[\\/\s_.-]|$)/i
const TEMPORAL_SERIES_GAP_MS = 120_000
const TEMPORAL_SERIES_SPAN_MS = 8 * 60_000

export function normalizeSmartCategorySettings(settings?: LiteSmartCategorySettings): LiteSmartCategorySettings {
  const product = settings?.productPhotos
  return {
    productPhotos: {
      sensitivity: isSensitivity(product?.sensitivity) ? product.sensitivity : DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos.sensitivity,
      recognizeSeries: typeof product?.recognizeSeries === 'boolean' ? product.recognizeSeries : DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos.recognizeSeries,
      preferNoPeople: typeof product?.preferNoPeople === 'boolean' ? product.preferNoPeople : DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos.preferNoPeople
    }
  }
}

export function productPhotoThreshold(sensitivity: LiteSmartCategorySensitivity): number {
  if (sensitivity === 'conservative') return 0.78
  if (sensitivity === 'broad') return 0.4
  return 0.58
}

export function findLikelyProductPhotos(
  items: LiteMediaRecord[],
  similarityGroups: LiteSimilarityGroup[],
  settings: LiteProductPhotoSettings
): LiteProductPhotoMatch[] {
  const images = items.filter((item) => item.kind === 'image')
  const similarityByItem = buildSimilaritySignals(similarityGroups)
  const temporalSeriesByItem = settings.recognizeSeries ? buildTemporalSeriesSizes(images) : new Map<string, number>()
  const threshold = productPhotoThreshold(settings.sensitivity)
  const matches: LiteProductPhotoMatch[] = []

  for (const item of images) {
    if (item.productPhotoOverride === false) continue
    if (item.productPhotoOverride === true) {
      matches.push({ item, score: 1, reasons: ['Manually marked as a product photo'], seriesSize: temporalSeriesByItem.get(item.id) ?? 1, manuallyIncluded: true })
      continue
    }
    if (classifyLikelyNonPhoto(item)) continue

    let score = 0.04
    const reasons: string[] = []
    let seriesSize = temporalSeriesByItem.get(item.id) ?? 1

    if (PRODUCT_PATH_HINT.test(item.relativePath) || PRODUCT_PATH_HINT.test(item.name)) {
      score += 0.7
      reasons.push('Folder or filename suggests sale/product photos')
    }

    if (settings.recognizeSeries) {
      const visual = similarityByItem.get(item.id)
      if (visual) {
        score += visual.strength
        seriesSize = Math.max(seriesSize, visual.size)
        reasons.push(visual.label)
      }
      if (seriesSize >= 3) {
        score += 0.22
        reasons.push(`${seriesSize} photos were captured as a short series`)
        if (seriesSize >= 5) score += 0.08
      }
    }

    if (item.faceAnalysisStatus === 'ready') {
      const faceCount = item.faces?.length ?? 0
      if (faceCount === 0 && settings.preferNoPeople) {
        score += 0.16
        reasons.push('No people detected')
      } else if (faceCount > 0 && settings.preferNoPeople) {
        score -= 0.34
        reasons.push('People detected in the photo')
      }
    }

    if (item.cameraMake?.trim() || item.cameraModel?.trim()) score += 0.04

    score = roundScore(score)
    if (score >= threshold) matches.push({ item, score, reasons, seriesSize, manuallyIncluded: false })
  }

  return matches.sort((left, right) => right.score - left.score || captureTime(right.item) - captureTime(left.item) || left.item.relativePath.localeCompare(right.item.relativePath))
}

export function setProductPhotoOverride(
  items: LiteMediaRecord[],
  itemId: string,
  productPhoto: boolean,
  updatedAt = Date.now()
): { items: LiteMediaRecord[]; changed: LiteMediaRecord | null } {
  let changed: LiteMediaRecord | null = null
  const next = items.map((item) => {
    if (item.id !== itemId || item.kind !== 'image') return item
    if (item.productPhotoOverride === productPhoto) return item
    changed = {
      ...item,
      productPhotoOverride: productPhoto,
      productPhotoOverrideUpdatedAt: updatedAt
    }
    return changed
  })
  return { items: next, changed }
}

function buildSimilaritySignals(groups: LiteSimilarityGroup[]): Map<string, SimilaritySignal> {
  const output = new Map<string, SimilaritySignal>()
  for (const group of groups) {
    if (group.kind === 'exact') continue
    const size = group.itemIds.length
    if (size < 2) continue
    const strength = size >= 3 ? (group.kind === 'burst' ? 0.36 : 0.32) : (group.kind === 'burst' ? 0.2 : 0.18)
    const label = group.kind === 'burst'
      ? `${size} visually related burst photos`
      : `${size} visually similar photos`
    for (const itemId of group.itemIds) {
      const current = output.get(itemId)
      if (!current || strength > current.strength || (strength === current.strength && size > current.size)) output.set(itemId, { strength, size, label })
    }
  }
  return output
}

function buildTemporalSeriesSizes(items: LiteMediaRecord[]): Map<string, number> {
  const reliable = items
    .filter((item) => item.captureTimeSource !== 'file' && typeof item.effectiveCaptureTime === 'number')
    .sort((left, right) => left.effectiveCaptureTime! - right.effectiveCaptureTime!)
  const sizes = new Map<string, number>()
  let cluster: LiteMediaRecord[] = []

  const flush = (): void => {
    if (cluster.length >= 3) for (const item of cluster) sizes.set(item.id, cluster.length)
    cluster = []
  }

  for (const item of reliable) {
    const previous = cluster[cluster.length - 1]
    const first = cluster[0]
    if (!previous || !first) {
      cluster = [item]
      continue
    }
    const gap = item.effectiveCaptureTime! - previous.effectiveCaptureTime!
    const span = item.effectiveCaptureTime! - first.effectiveCaptureTime!
    if (gap <= TEMPORAL_SERIES_GAP_MS && span <= TEMPORAL_SERIES_SPAN_MS && sameFrameShape(previous, item)) {
      cluster.push(item)
      continue
    }
    flush()
    cluster = [item]
  }
  flush()
  return sizes
}

function sameFrameShape(left: LiteMediaRecord, right: LiteMediaRecord): boolean {
  if (!left.width || !left.height || !right.width || !right.height) return true
  const leftLandscape = left.width >= left.height
  const rightLandscape = right.width >= right.height
  if (leftLandscape !== rightLandscape) return false
  const leftRatio = left.width / left.height
  const rightRatio = right.width / right.height
  return Math.abs(leftRatio - rightRatio) <= 0.08
}

function captureTime(item: LiteMediaRecord): number {
  return item.effectiveCaptureTime ?? item.lastModified
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100
}

function isSensitivity(value: unknown): value is LiteSmartCategorySensitivity {
  return value === 'conservative' || value === 'balanced' || value === 'broad'
}
