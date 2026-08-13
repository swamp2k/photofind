import type { LiteMediaRecord } from './types'

export type LiteNonPhotoKind = 'screenshot' | 'document'

export interface LiteNonPhotoClassification {
  kind: LiteNonPhotoKind
  confidence: number
  reasons: string[]
}

const SCREENSHOT_NAME = /(?:^|[\s_.-])(screenshot|screen[\s_-]?shot|screencap|screen[\s_-]?capture|sk[æa]rmbillede)(?:[\s_.-]|$)/i
const DOCUMENT_NAME = /(?:^|[\s_.-])(receipt|kvittering|invoice|faktura|scan(?:ned)?|document|dokument|ticket|billet)(?:[\s_.-]|$)/i
const COMMON_SCREEN_SIDES = [
  640, 720, 750, 800, 828, 900, 1080, 1125, 1170, 1200, 1242, 1280, 1284, 1290,
  1440, 1536, 1600, 1920, 2048, 2160, 2220, 2280, 2340, 2400, 2436, 2460, 2532,
  2556, 2560, 2688, 2778, 2796, 2960, 3040, 3088, 3120, 3200, 3216, 3440, 3840
]

export function classifyLikelyNonPhoto(item: LiteMediaRecord): LiteNonPhotoClassification | null {
  const name = item.name || item.relativePath
  if (SCREENSHOT_NAME.test(name)) {
    return { kind: 'screenshot', confidence: 0.99, reasons: ['Filename identifies a screenshot'] }
  }
  if (DOCUMENT_NAME.test(name)) {
    return { kind: 'document', confidence: 0.97, reasons: ['Filename looks like a receipt, scan or document'] }
  }

  if (item.qualityStatus !== 'ready') return null

  const hasCamera = Boolean(item.cameraMake?.trim() || item.cameraModel?.trim())
  const edgeStrength = averageDefined(item.horizontalGradient, item.verticalGradient)
  const laplacian = item.laplacianMeanAbs ?? 0
  const mean = item.meanLuminance ?? 0
  const contrast = item.luminanceStdDev ?? 0
  const highlights = item.highlightClipFraction ?? 0

  if (
    !hasCamera
    && item.captureTimeSource !== 'exif'
    && isScreenLikeSize(item.width, item.height)
    && laplacian >= 5.5
    && edgeStrength >= 4.5
  ) {
    return {
      kind: 'screenshot',
      confidence: item.mimeType.toLowerCase().includes('png') ? 0.9 : 0.84,
      reasons: ['Screen-like dimensions', 'No camera metadata', 'Sharp interface-like edges']
    }
  }

  const strongDocumentTexture = laplacian >= 6 && edgeStrength >= 5
  const documentContrast = contrast >= 0.13 && contrast <= 0.36
  const veryWhiteCameraPage = hasCamera && mean >= 0.76 && highlights >= 0.34
  const brightDigitalPage = !hasCamera && mean >= 0.69 && highlights >= 0.22
  if (strongDocumentTexture && documentContrast && (veryWhiteCameraPage || brightDigitalPage)) {
    return {
      kind: 'document',
      confidence: hasCamera ? 0.82 : 0.87,
      reasons: [
        hasCamera ? 'Large bright paper-like area' : 'Bright document-like image without camera metadata',
        'Dense sharp edges consistent with text'
      ]
    }
  }

  return null
}

export function isLikelyNonPhoto(item: LiteMediaRecord): boolean {
  return classifyLikelyNonPhoto(item) !== null
}

function isScreenLikeSize(width?: number, height?: number): boolean {
  if (!width || !height || width < 500 || height < 500) return false
  const longSide = Math.max(width, height)
  const shortSide = Math.min(width, height)
  const ratio = longSide / shortSide
  if (ratio < 1.42 || ratio > 2.55) return false
  return COMMON_SCREEN_SIDES.some((side) => Math.abs(width - side) <= 4 || Math.abs(height - side) <= 4)
}

function averageDefined(left?: number, right?: number): number {
  if (typeof left === 'number' && typeof right === 'number') return (left + right) / 2
  return left ?? right ?? 0
}
