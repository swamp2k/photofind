import { prepareMetadataAwareExport, xmpSidecarName, type LiteExportMetadataMode } from './exportMetadata'
import { reviewStateOf } from './review'
import type { LiteExportFailure, LiteExportLayout, LiteExportProgress, LiteExportResult, LiteMediaRecord } from './types'

interface ExportOptions {
  items: LiteMediaRecord[]
  destination: FileSystemDirectoryHandle
  layout: LiteExportLayout
  resolveFile(item: LiteMediaRecord): Promise<File | null>
  onProgress?(progress: LiteExportProgress): void
  includeReports?: boolean
  embedMetadata?: boolean
}

interface ManifestEntry {
  sourcePath: string
  exportedPath?: string
  metadataMode?: LiteExportMetadataMode
  sidecarPath?: string
  metadataNotes?: string[]
  reviewState: string
  captureTime?: string
  qualityScore?: number
  qualityTier?: string
  latitude?: number
  longitude?: number
  error?: string
}

export async function exportLocalPhotos(options: ExportOptions): Promise<LiteExportResult> {
  const root = options.destination
  const failures: LiteExportFailure[] = []
  const manifest: ManifestEntry[] = []
  let exported = 0
  let renamed = 0
  let metadataEmbedded = 0
  let sidecarsWritten = 0
  let metadataUnchanged = 0

  for (let index = 0; index < options.items.length; index += 1) {
    const item = options.items[index]
    let exportedPath: string | undefined
    let metadataMode: LiteExportMetadataMode | undefined
    let metadataNotes: string[] | undefined
    let sidecarPath: string | undefined
    try {
      const source = await options.resolveFile(item)
      if (!source) throw new Error('Local file access is unavailable. Reconnect the source folder and retry.')
      const prepared = await prepareMetadataAwareExport(item, source, options.embedMetadata !== false)
      metadataMode = prepared.metadataMode
      metadataNotes = prepared.notes
      const plan = exportPathParts(item, options.layout)
      const directory = await ensureDirectories(root, plan.directories)
      const unique = await allocateUniqueName(directory, plan.fileName)
      if (unique.renamed) renamed += 1
      await writeBlob(directory, unique.name, prepared.blob)
      exportedPath = [...plan.directories, unique.name].join('/')
      exported += 1

      if (prepared.metadataMode === 'embedded') metadataEmbedded += 1
      else if (prepared.metadataMode === 'unchanged') metadataUnchanged += 1

      if (prepared.sidecar) {
        try {
          const sidecarName = await allocateUniqueName(directory, xmpSidecarName(unique.name))
          await writeBlob(directory, sidecarName.name, prepared.sidecar)
          sidecarPath = [...plan.directories, sidecarName.name].join('/')
          sidecarsWritten += 1
        } catch (cause) {
          failures.push({ itemId: `${item.id}:xmp`, relativePath: `${item.relativePath} metadata sidecar`, message: messageOf(cause) })
        }
      }

      manifest.push(manifestEntry(item, { exportedPath, metadataMode, metadataNotes, sidecarPath }))
    } catch (cause) {
      const message = messageOf(cause)
      failures.push({ itemId: item.id, relativePath: item.relativePath, message })
      manifest.push({ ...manifestEntry(item, { exportedPath, metadataMode, metadataNotes, sidecarPath }), error: message })
    }

    options.onProgress?.({
      complete: index + 1,
      total: options.items.length,
      exported,
      renamed,
      failed: failures.length,
      metadataEmbedded,
      sidecarsWritten,
      currentPath: item.relativePath
    })
    await Promise.resolve()
  }

  let manifestPath: string | undefined
  let reportPath: string | undefined
  if (options.includeReports !== false) {
    const timestamp = fileTimestamp(new Date())
    const summary = { exportedAt: new Date().toISOString(), layout: options.layout, exported, renamed, metadataEmbedded, sidecarsWritten, metadataUnchanged, failures, items: manifest }
    try {
      const manifestName = await allocateUniqueName(root, `photofind-selection-${timestamp}.json`)
      await writeText(root, manifestName.name, JSON.stringify(summary, null, 2), 'application/json')
      manifestPath = manifestName.name
    } catch (cause) {
      failures.push({ itemId: '__json-report__', relativePath: 'JSON selection report', message: messageOf(cause) })
    }

    try {
      const reportName = await allocateUniqueName(root, `photofind-selection-${timestamp}.html`)
      await writeText(root, reportName.name, buildHtmlReport(manifest, { exported, failed: failures.length, metadataEmbedded, sidecarsWritten }), 'text/html')
      reportPath = reportName.name
    } catch (cause) {
      failures.push({ itemId: '__html-report__', relativePath: 'HTML selection report', message: messageOf(cause) })
    }
  }

  return { exported, renamed, metadataEmbedded, sidecarsWritten, metadataUnchanged, failures, manifestPath, reportPath }
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

function manifestEntry(item: LiteMediaRecord, exportInfo: {
  exportedPath?: string
  metadataMode?: LiteExportMetadataMode
  metadataNotes?: string[]
  sidecarPath?: string
}): ManifestEntry {
  return {
    sourcePath: item.relativePath,
    ...exportInfo,
    reviewState: reviewStateOf(item),
    ...(typeof item.effectiveCaptureTime === 'number' ? { captureTime: new Date(item.effectiveCaptureTime).toISOString() } : {}),
    ...(typeof item.qualityScore === 'number' ? { qualityScore: item.qualityScore } : {}),
    ...(item.qualityTier ? { qualityTier: item.qualityTier } : {}),
    ...(typeof item.latitude === 'number' ? { latitude: item.latitude } : {}),
    ...(typeof item.longitude === 'number' ? { longitude: item.longitude } : {})
  }
}

async function ensureDirectories(root: FileSystemDirectoryHandle, segments: string[]): Promise<FileSystemDirectoryHandle> {
  let current = root
  for (const segment of segments) current = await current.getDirectoryHandle(segment, { create: true })
  return current
}

async function allocateUniqueName(directory: FileSystemDirectoryHandle, desiredName: string): Promise<{ name: string; renamed: boolean }> {
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const candidate = collisionCandidate(desiredName, attempt)
    if (!(await fileExists(directory, candidate))) return { name: candidate, renamed: attempt > 1 }
  }
  throw new Error(`Could not allocate a collision-safe filename for ${desiredName}.`)
}

async function fileExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getFileHandle(name)
    return true
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'NotFoundError') return false
    throw cause
  }
}

async function writeBlob(directory: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

async function writeText(directory: FileSystemDirectoryHandle, name: string, content: string, type: string): Promise<void> {
  await writeBlob(directory, name, new Blob([content], { type }))
}

function sanitizeFileName(value: string): string {
  const cleaned = sanitizeSegment(value)
  return cleaned || 'photo'
}

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim()
  return cleaned || 'Untitled'
}

function buildHtmlReport(
  entries: ManifestEntry[],
  summary: { exported: number; failed: number; metadataEmbedded: number; sidecarsWritten: number }
): string {
  const rows = entries.map((entry) => {
    const link = entry.exportedPath ? `<a href="${escapeAttribute(encodeURI(entry.exportedPath))}">${escapeHtml(entry.exportedPath)}</a>` : 'Not exported'
    const quality = typeof entry.qualityScore === 'number' ? `${entry.qualityScore}/100${entry.qualityTier ? ` (${escapeHtml(entry.qualityTier)})` : ''}` : 'Not analyzed'
    const metadata = entry.metadataMode === 'embedded' ? 'Embedded in file' : entry.metadataMode === 'sidecar' ? `XMP sidecar${entry.sidecarPath ? `: ${escapeHtml(entry.sidecarPath)}` : ''}` : 'Original metadata unchanged'
    return `<tr><td>${link}</td><td>${escapeHtml(entry.reviewState)}</td><td>${quality}</td><td>${escapeHtml(entry.captureTime ?? '')}</td><td>${metadata}</td><td>${escapeHtml(entry.error ?? '')}</td></tr>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PhotoFind selection</title><style>body{font:14px system-ui;margin:24px;color:#222}table{border-collapse:collapse;width:100%}th,td{padding:8px;border:1px solid #ccc;text-align:left;vertical-align:top}th{background:#eee}small{color:#666}</style></head><body><h1>PhotoFind selection</h1><p>${summary.exported} photos exported · ${summary.metadataEmbedded} with embedded metadata · ${summary.sidecarsWritten} XMP sidecars · ${summary.failed} failures</p><p><small>Generated locally by PhotoFind. Source files were not modified.</small></p><table><thead><tr><th>Exported file</th><th>Review</th><th>Technical quality</th><th>Capture time</th><th>Metadata</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
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
