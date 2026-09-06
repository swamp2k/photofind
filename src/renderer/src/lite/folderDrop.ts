import type { LiteSelectionFile } from './types'

type FileSystemHandleCapableItem = DataTransferItem & {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>
}

export type LiteFolderSource =
  | { kind: 'handle'; name: string; handle: FileSystemDirectoryHandle }
  | { kind: 'selection'; name: string; files: LiteSelectionFile[] }

export interface LiteDroppedFolders {
  sources: LiteFolderSource[]
  /** Names of dropped items that were not folders, so Diagnostics can report them honestly. */
  ignored: string[]
}

export function dragEventCarriesFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) return false
  if (Array.from(transfer.types ?? []).includes('Files')) return true
  return Array.from(transfer.items ?? []).some((item) => item.kind === 'file')
}

/**
 * Reads dropped folders as directory handles when the browser exposes them, and falls back to
 * reading the dropped directory entries into a session file selection when it does not.
 *
 * The DataTransfer item list is only valid during the drop event, so every item is captured
 * synchronously before any awaiting happens.
 */
export async function readDroppedFolders(transfer: DataTransfer): Promise<LiteDroppedFolders> {
  const captured = Array.from(transfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => {
      const capable = item as FileSystemHandleCapableItem
      return {
        handle: typeof capable.getAsFileSystemHandle === 'function' ? capable.getAsFileSystemHandle() : null,
        entry: typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null,
        file: item.getAsFile()
      }
    })

  const sources: LiteFolderSource[] = []
  const ignored: string[] = []

  for (const item of captured) {
    const handle = item.handle ? await item.handle.catch(() => null) : null
    if (handle) {
      if (handle.kind === 'directory') sources.push({ kind: 'handle', name: handle.name, handle: handle as FileSystemDirectoryHandle })
      else ignored.push(handle.name)
      continue
    }

    const entry = item.entry
    if (entry?.isDirectory) {
      const files = await readDirectoryEntry(entry as FileSystemDirectoryEntry, [entry.name])
      sources.push({ kind: 'selection', name: entry.name, files })
      continue
    }

    const name = entry?.name ?? item.file?.name
    if (name) ignored.push(name)
  }

  return { sources, ignored }
}

async function readDirectoryEntry(directory: FileSystemDirectoryEntry, segments: string[]): Promise<LiteSelectionFile[]> {
  const files: LiteSelectionFile[] = []
  for (const entry of await readAllEntries(directory)) {
    const childSegments = [...segments, entry.name]
    if (entry.isDirectory) {
      files.push(...await readDirectoryEntry(entry as FileSystemDirectoryEntry, childSegments))
      continue
    }
    const file = await readFileEntry(entry as FileSystemFileEntry)
    if (file) files.push({ file, relativePath: childSegments.join('/') })
  }
  return files
}

function readAllEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader()
  const entries: FileSystemEntry[] = []
  return new Promise((resolve, reject) => {
    const readBatch = (): void => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries)
          return
        }
        entries.push(...batch)
        readBatch()
      }, reject)
    }
    readBatch()
  })
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file((file) => resolve(file), () => resolve(null))
  })
}

export interface LiteFolderBatchOutcome {
  added: string[]
  rescanned: string[]
  failed: Array<{ name: string; message: string }>
  ignored: string[]
}

export function summarizeFolderBatch(outcome: LiteFolderBatchOutcome): string | null {
  const parts: string[] = []
  if (outcome.added.length > 0) parts.push(`${outcome.added.length} folder${plural(outcome.added.length)} indexed`)
  if (outcome.rescanned.length > 0) parts.push(`${outcome.rescanned.length} already-known folder${plural(outcome.rescanned.length)} rescanned`)
  if (outcome.ignored.length > 0) parts.push(`${outcome.ignored.length} dropped item${plural(outcome.ignored.length)} skipped because ${outcome.ignored.length === 1 ? 'it is not a folder' : 'they are not folders'}`)
  if (outcome.failed.length > 0) parts.push(`${outcome.failed.length} folder${plural(outcome.failed.length)} failed`)
  if (parts.length === 0) return null
  return `${parts.join(' · ')}.`
}

export function describeFolderFailures(failed: Array<{ name: string; message: string }>): string | null {
  if (failed.length === 0) return null
  return `These folders could not be indexed: ${failed.map((entry) => `“${entry.name}” (${entry.message})`).join('; ')}`
}

function plural(count: number): string {
  return count === 1 ? '' : 's'
}
