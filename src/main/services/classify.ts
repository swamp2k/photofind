import type { MediaKind } from '../../shared/types'

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'tif', 'tiff', 'bmp'])
const RAW_EXT = new Set(['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2'])
const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', '3gp'])
const SIDECAR_EXT = new Set(['json', 'xmp'])

export function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

export function classify(fileName: string): MediaKind {
  const ext = extOf(fileName)
  if (IMAGE_EXT.has(ext)) return 'image'
  if (RAW_EXT.has(ext)) return 'raw'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (SIDECAR_EXT.has(ext)) return 'sidecar'
  return 'unknown'
}
