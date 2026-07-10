import { ExifTool } from 'exiftool-vendored'

let instance: ExifTool | null = null

/**
 * Shared ExifTool process pool for read-heavy scanning. Callers must not
 * end() it themselves; the app disposes it once on shutdown.
 */
export function getExiftool(): ExifTool {
  if (!instance) {
    instance = new ExifTool({ maxProcs: 4 })
  }
  return instance
}

export async function disposeExiftool(): Promise<void> {
  if (!instance) return
  const current = instance
  instance = null
  await current.end()
}
