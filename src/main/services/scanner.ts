import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScannedFile } from '../../shared/types'
import { classify } from './classify'

const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store'])

/** Recursively walks a directory and classifies every file it finds. */
export async function scanDirectory(root: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = []
  await walk(root, results)
  return results
}

async function walk(dir: string, results: ScannedFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath, results)
    } else if (entry.isFile()) {
      const stats = await stat(fullPath)
      results.push({
        path: fullPath,
        name: entry.name,
        kind: classify(entry.name),
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs
      })
    }
  }
}
