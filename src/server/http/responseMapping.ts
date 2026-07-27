import { basename } from 'node:path'
import type { ExportResult, RepairResult, ScanResult } from '../../shared/types'
import { RootPolicy } from '../paths/rootPolicy'
import { validateThumbnailKey } from '../paths/thumbnailKey'

async function browserPath(path: string, policy: RootPolicy): Promise<string> { return policy.toUri(path) }
function diagnostic(value: string): string {
  return value.replace(/(?:[A-Za-z]:[\\/]|\\\\|\/)(?:[^\s"'<>]+[\\/])*[^\s"'<>]*/g, '[path omitted]')
}
function mapLog<T extends { message: string }>(entry: T): T { return { ...entry, message: diagnostic(entry.message) } }

export async function mapScanResult(result: ScanResult, policy: RootPolicy): Promise<ScanResult> {
  return {
    ...result,
    matches: await Promise.all(result.matches.map(async (match) => ({ ...match, reason: diagnostic(match.reason), media: await mapFile(match.media, policy), sidecar: match.sidecar ? await mapFile(match.sidecar, policy) : null, alternateSidecars: match.alternateSidecars ? await Promise.all(match.alternateSidecars.map((file) => mapFile(file, policy))) : undefined }))),
    thumbnails: { ...result.thumbnails, items: await Promise.all(result.thumbnails.items.map(async (item) => ({ ...item, reason: item.reason ? diagnostic(item.reason) : item.reason, mediaPath: await browserPath(item.mediaPath, policy), thumbnailPath: null, thumbnailUrl: item.thumbnailPath ? `/api/thumbnails/${validateThumbnailKey(basename(item.thumbnailPath))}` : null }))), log: result.thumbnails.log.map(mapLog) },
    keepers: await Promise.all(result.keepers.map((path) => browserPath(path, policy))), log: result.log.map(mapLog)
  }
}

export async function mapExportResult(result: ExportResult, policy: RootPolicy): Promise<ExportResult> {
  return { ...result, destinationRoot: await browserPath(result.destinationRoot, policy), reportPath: await browserPath(result.reportPath, policy), files: await Promise.all(result.files.map(async (file) => ({ ...file, reason: file.reason ? diagnostic(file.reason) : file.reason, sourcePath: await browserPath(file.sourcePath, policy), outputPath: file.outputPath ? await browserPath(file.outputPath, policy) : null }))), log: result.log.map(mapLog) }
}

export function mapRepairResult(result: RepairResult): RepairResult {
  return { ...result, log: result.log.map(mapLog) }
}

type PathFile = { path: string }
async function mapFile<T extends PathFile>(file: T, policy: RootPolicy): Promise<T> { return { ...file, path: await browserPath(file.path, policy) } }
export const toBrowserScanResult = mapScanResult
export const toBrowserExportResult = mapExportResult
export const mapScanResultForBrowser = mapScanResult
export const mapExportResultForBrowser = mapExportResult
