import type { LiteMediaRecord } from './types'

export interface LiteSourceFolderSummary {
  folder: string
  count: number
}

export function sourceFolderOf(relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  const slash = normalized.lastIndexOf('/')
  return slash < 0 ? '' : normalized.slice(0, slash)
}

export function sourceFolderLabel(folder: string): string {
  return folder || 'Library root'
}

export function sourceFolderName(folder: string): string {
  if (!folder) return 'Library root'
  return folder.split('/').filter(Boolean).at(-1) ?? folder
}

export function isInExactSourceFolder(item: Pick<LiteMediaRecord, 'relativePath'>, folder: string): boolean {
  return sourceFolderOf(item.relativePath) === folder
}

export function summarizeSourceFolders(items: Array<Pick<LiteMediaRecord, 'relativePath'>>): LiteSourceFolderSummary[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const folder = sourceFolderOf(item.relativePath)
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder))
}

export function topLevelSourceFolder(relativePath: string): string {
  const folder = sourceFolderOf(relativePath)
  return folder.split('/').filter(Boolean)[0] ?? ''
}
