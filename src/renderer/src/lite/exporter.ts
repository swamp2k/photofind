import { reviewStateOf } from './review'
import type { LiteExportFailure, LiteExportLayout, LiteExportProgress, LiteExportResult, LiteMediaRecord } from './types'

interface WritableStreamLike {
  write(data: Blob | string): Promise<void>
  close(): Promise<void>
}

interface WritableFileHandle extends FileSystemFileHandle {
  createWritable(): Promise<WritableStreamLike>
}

interface WritableDirectoryHandle extends FileSystemDirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<WritableDirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<WritableFileHandle>
}

interface ExportOptions {
  items: LiteMediaRecord[]
  destination: FileSystemDirectoryHandle
  layout: LiteExportLayout
  resolveFile(item: LiteMediaRecord): Promise<File | null>
  onProgress?(progress: LiteExportProgress): void
  includeReports?: boolean
}

interface ManifestEntry {
  sourcePath: string
  exportedPath?: string
  reviewState: string
  captureTime?: string
  qualityScore?: number
  qualityTier?: string
  latitude?: number
  longitude?: number
  error?: string
}

export async function exportLocalPhotos(options: ExportOptions): Promise<LiteExportResult> {
  const root = options.destination as WritableDirectoryHandle
  const failures: LiteExportFailure[] = []
  const manifest: ManifestEntry[] = []
  let exported = 0
  let renamed = 0

  for (let index = 0; index < options.items.length; index += 1) {
    const item = options.items[index]
    let exportedPath: string | undefined
    try {
      const source = await options.resolveFile(item)
      if (!source) throw new Error('Local file access is unavailable. Reconnect the source folder and retry.')
      const plan = exportPathParts(item, options.layout)
      const directory = await ensureDirectories(root, plan.directories)
      const unique = await allocateUniqueName(directory, plan.fileName)
      if (unique.renamed) renamed += 1
      const handle = await directory.getFileHandle(unique.name, { create: true })
      const writable = await handle.createWritable()
      await writable.write(source)
      await writable.close()
      exportedPath = [...plan.directories, unique.name].join('/')
      exported += 1
      manifest.push(manifestEntry(item, exportedPath))
    } catch (cause) {
      const message = messageOf(cause)
      failures.push({ itemId: item.id, relativePath: item.relativePath, message })
      manifest.push({ ...manifestEntry(item, exportedPath), error: message })
    }

    options.onProgress?.({
      complete: index + 1,
      total: options.items.length,
      exported,
      renamed,
      failed: failures.length,
      currentPath: item.relativePath
    })
    await Promise.resolve()
  }

  let manifestPath: string | undefined
  let reportPath: string | undefined
  if (options.includeReports !== false) {
    const timestamp = fileTimestamp(new Date())
    const manifestName = await allocateUniqueName(root, `photofind-selection-${timestamp}.json`)
    await writeText(root, manifestName.name, JSON.stringify({ exportedAt: new Date().toISOString(), layout: options.layout, exported, renamed, failures, items: manifest }, null, 2), 'application/json')
    manifestPath = manifestName.name

    const reportName = await allocateUniqueName(root, `photofind-selection-${timestamp}.html`)
    await writeText(root, reportName.name, buildHtmlReport(manifest, exported, failures.length), 'text/html')
    reportPath = reportName.name
  }

  return { exported, renamed, failures, manifestPath, reportPath }
}

export function exportPathParts(item: LiteMediaRecord, layout: LiteExportLayout): { directories: string[]; fileName: string } {
  const fileName = sanitizeFileName(item.name)
  if (layout === 'flat') return { directories: [], fileName }
  if (layout === 'source-folders') {
    const parts = item.relativePath.replaceAll('\\', '/').split('/').filter(Boolean)
    return { directories: parts.slice(0, -1).map(sanitizeSegment), fileName }
  }

  const date = typeof item.effectiveCaptureTime === 'number' ? new Date(item.effectiveCaptureTime) : null
  if (!date || Number.isNaN(date.getTime())) return { directories: ['Undated'], fileName }
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  if (layout === 'date-month') return { directories: [year, month], fileName }
  const day = String(date.getDate()).padStart(2, '0')
  return { directories: [year, month, day], fileName }
}

export function collisionCandidate(fileName: string, attempt: number): string {
  if (attempt <= 1) return fileName
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return `${fileName} (${attempt})`
  return `${fileName.slice(0, dot)} (${attempt})${fileName.slice(dot)}`
}

function manifestEntry(item: LiteMediaRecord, exportedPath?: string): ManifestEntry {
  return {
    sourcePath: item.relativePath,
    ...(exportedPath ? { exportedPath } : {}),
    reviewState: reviewStateOf(item),
    ...(typeof item.effectiveCaptureTime === 'number' ? { captureTime: new Date(item.effectiveCaptureTime).toISOString() } : {}),
    ...(typeof item.qualityScore === 'number' ? { qualityScore: item.qualityScore } : {}),
    ...(item.qualityTier ? { qualityTier: item.qualityTier } : {}),
    ...(typeof item.latitude === 'number' ? { latitude: item.latitude } : {}),
    ...(typeof item.longitude === 'number' ? { longitude: item.longitude } : {})
  }
}

async function ensureDirectories(root: WritableDirectoryHandle, segments: string[]): Promise<WritableDirectoryHandle> {
  let current = root
  for (const segment of segments) current = await current.getDirectoryHandle(segment, { create: true })
  return current
}

async function allocateUniqueName(directory: WritableDirectoryHandle, desiredName: string): Promise<{ name: string; renamed: boolean }> {
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const candidate = collisionCandidate(desiredName, attempt)
    if (!(await fileExists(directory, candidate))) return { name: candidate, renamed: attempt > 1 }
  }
  throw new Error(`Could not allocate a collision-safe filename for ${desiredName}.`)
}

async function fileExists(directory: WritableDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getFileHandle(name)
    return true
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'NotFoundError') return false
    throw cause
  }
}

async function writeText(directory: WritableDirectoryHandle, name: string, content: string, type: string): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(new Blob([content], { type }))
  await writable.close()
}

function sanitizeFileName(value: string): string {
  const cleaned = sanitizeSegment(value)
  return cleaned || 'photo'
}

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim()
  return cleaned || 'Untitled'
}

function buildHtmlReport(entries: ManifestEntry[], exported: number, failed: number): string {
  const rows = entries.map((entry) => {
    const link = entry.exportedPath ? `<a href="${escapeAttribute(encodeURI(entry.exportedPath))}">${escapeHtml(entry.exportedPath)}</a>` : 'Not exported'
    const quality = typeof entry.qualityScore === 'number' ? `${entry.qualityScore}/100${entry.qualityTier ? ` (${escapeHtml(entry.qualityTier)})` : ''}` : 'Not analyzed'
    return `<tr><td>${link}</td><td>${escapeHtml(entry.reviewState)}</td><td>${quality}</td><td>${escapeHtml(entry.captureTime ?? '')}</td><td>${escapeHtml(entry.error ?? '')}</td></tr>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PhotoFind selection</title><style>body{font:14px system-ui;margin:24px;color:#222}table{border-collapse:collapse;width:100%}th,td{padding:8px;border:1px solid #ccc;text-align:left;vertical-align:top}th{background:#eee}small{color:#666}</style></head><body><h1>PhotoFind selection</h1><p>${exported} photos exported · ${failed} failures</p><p><small>Generated locally by PhotoFind. Source files were not modified.</small></p><table><thead><tr><th>Exported file</th><th>Review</th><th>Technical quality</th><th>Capture time</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}

function fileTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Unknown export failure.'
}
