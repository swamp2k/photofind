import { heicTo } from 'heic-to/csp'
import type { LiteMediaRecord } from './types'

const HEIC_EXTENSIONS = new Set(['heic', 'heif'])
const HEIC_DECODE_TIMEOUT_MS = 30_000

export function isHeicMedia(file: Blob, item?: Pick<LiteMediaRecord, 'name' | 'mimeType'>): boolean {
  const mime = (file.type || item?.mimeType || '').toLowerCase()
  if (mime.includes('heic') || mime.includes('heif')) return true
  const name = item?.name || ('name' in file && typeof (file as File).name === 'string' ? (file as File).name : '')
  const extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  return HEIC_EXTENSIONS.has(extension)
}

export async function displayBlobForPhoto(
  file: File,
  item: Pick<LiteMediaRecord, 'name' | 'mimeType'>,
  maxDimension?: number
): Promise<Blob> {
  if (!isHeicMedia(file, item)) return file
  const jpeg = await decodeHeicJpeg(file)
  if (!maxDimension || maxDimension <= 0) return jpeg

  const bitmap = await createImageBitmap(jpeg)
  try {
    return await bitmapToJpeg(bitmap, maxDimension)
  } finally {
    bitmap.close()
  }
}

export async function decodeBitmapForAnalysis(
  file: File,
  item: Pick<LiteMediaRecord, 'name' | 'mimeType' | 'width' | 'height'>,
  maxDimension: number
): Promise<ImageBitmap> {
  const source = isHeicMedia(file, item) ? await decodeHeicJpeg(file, 0.88) : file
  const bitmap = await createImageBitmap(source)
  return resizeBitmap(bitmap, maxDimension)
}

async function decodeHeicJpeg(file: File, quality = 0.92): Promise<Blob> {
  const decoded = await withTimeout(
    heicTo({ blob: file, type: 'image/jpeg', quality }),
    HEIC_DECODE_TIMEOUT_MS,
    `HEIC decoding timed out after ${HEIC_DECODE_TIMEOUT_MS / 1000} seconds.`
  )
  if (!(decoded instanceof Blob)) throw new Error('HEIC decoder did not return a JPEG image.')
  if (decoded.size === 0) throw new Error('HEIC decoder returned an empty JPEG image.')
  return decoded
}

async function resizeBitmap(bitmap: ImageBitmap, maxDimension: number): Promise<ImageBitmap> {
  const largest = Math.max(bitmap.width, bitmap.height)
  if (!Number.isFinite(maxDimension) || maxDimension <= 0 || largest <= maxDimension) return bitmap
  const scale = maxDimension / largest
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  try {
    const resized = await createImageBitmap(bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
    bitmap.close()
    return resized
  } catch {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return bitmap
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    const resized = await createImageBitmap(canvas)
    bitmap.close()
    return resized
  }
}

async function bitmapToJpeg(bitmap: ImageBitmap, maxDimension?: number): Promise<Blob> {
  const largest = Math.max(bitmap.width, bitmap.height)
  const scale = maxDimension && maxDimension > 0 && largest > maxDimension ? maxDimension / largest : 1
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable for HEIC preview conversion.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('HEIC preview conversion failed.')), 'image/jpeg', 0.92)
  })
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds)
    promise.then(
      (value) => { window.clearTimeout(timeout); resolve(value) },
      (error) => { window.clearTimeout(timeout); reject(error) }
    )
  })
}
