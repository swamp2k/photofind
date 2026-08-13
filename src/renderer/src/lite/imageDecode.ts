import { heicTo } from 'heic-to/csp'
import type { LiteMediaRecord } from './types'

const HEIC_EXTENSIONS = new Set(['heic', 'heif'])

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
  const bitmap = await decodeHeicBitmap(file)
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
  let bitmap: ImageBitmap
  if (isHeicMedia(file, item)) {
    bitmap = await decodeHeicBitmap(file)
  } else {
    bitmap = await createImageBitmap(file)
  }
  return resizeBitmap(bitmap, maxDimension)
}

async function decodeHeicBitmap(file: File): Promise<ImageBitmap> {
  const decoded = await heicTo({ blob: file, type: 'bitmap' })
  if (!(decoded instanceof ImageBitmap)) throw new Error('HEIC decoder did not return an image bitmap.')
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
