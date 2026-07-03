import AdmZip from 'adm-zip'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { LogEntry } from '../../shared/types'

export interface ExtractResult {
  destDir: string
  extracted: number
  skipped: number
  conflicts: number
  log: LogEntry[]
}

/**
 * Extracts multiple Google Takeout zip parts into one shared directory.
 * Takeout splits an export by size, not by folder, so a photo and its JSON
 * sidecar can land in different zip parts - they must merge into one tree
 * before scanning, or the sidecar matcher will see false "missing" results.
 */
export async function extractZips(zipPaths: string[], destDir: string): Promise<ExtractResult> {
  const log: LogEntry[] = []
  let extracted = 0
  let skipped = 0
  let conflicts = 0

  for (const zipPath of zipPaths) {
    let zip: AdmZip
    try {
      zip = new AdmZip(zipPath)
    } catch (err) {
      log.push(logEntry('ERROR', `Failed to open ${zipPath}: ${(err as Error).message}`))
      continue
    }

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const targetPath = join(destDir, entry.entryName)

      if (existsSync(targetPath)) {
        const existingSize = statSync(targetPath).size
        if (existingSize === entry.header.size) {
          skipped++
          continue
        }
        conflicts++
        log.push(
          logEntry(
            'WARN',
            `${entry.entryName}: already extracted from an earlier zip with a different size (${existingSize} vs ${entry.header.size} bytes) - kept the first copy`
          )
        )
        continue
      }

      try {
        zip.extractEntryTo(entry, destDir, true, false)
        extracted++
      } catch (err) {
        log.push(logEntry('ERROR', `Failed extracting ${entry.entryName} from ${zipPath}: ${(err as Error).message}`))
      }
    }
  }

  log.push(
    logEntry('INFO', `Extracted ${extracted} files (${skipped} duplicates skipped, ${conflicts} name conflicts) from ${zipPaths.length} zip file(s)`)
  )
  return { destDir, extracted, skipped, conflicts, log }
}

function logEntry(level: LogEntry['level'], message: string): LogEntry {
  return { level, message, timestamp: Date.now() }
}
