import type { LiteMediaKind } from './types'

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif'])
const RAW_EXT = new Set(['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2'])
const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', '3gp'])
const SIDECAR_EXT = new Set(['json', 'xmp'])

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

export function classifyMedia(fileName: string): LiteMediaKind {
  const extension = extensionOf(fileName)
  if (IMAGE_EXT.has(extension)) return 'image'
  if (RAW_EXT.has(extension)) return 'raw'
  if (VIDEO_EXT.has(extension)) return 'video'
  if (SIDECAR_EXT.has(extension)) return 'sidecar'
  return 'unknown'
}
