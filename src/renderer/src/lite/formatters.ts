import { hasLocation } from './filters'
import type { LiteMediaRecord } from './types'

export function formatCapture(item: LiteMediaRecord): string {
  const time = item.effectiveCaptureTime ?? item.lastModified
  const source = item.captureTimeSource === 'takeout' ? 'Takeout' : item.captureTimeSource === 'exif' ? 'EXIF' : 'file time'
  return `${new Date(time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${source}`
}

export function formatLocation(item: LiteMediaRecord): string {
  if (!hasLocation(item)) return 'No location'
  const source = item.locationSource === 'takeout' ? 'Takeout GPS' : 'EXIF GPS'
  return `${item.latitude!.toFixed(4)}, ${item.longitude!.toFixed(4)} · ${source}`
}
