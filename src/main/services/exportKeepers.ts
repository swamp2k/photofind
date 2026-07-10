import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ExportResult, ExportedFile, LogEntry } from '../../shared/types'

export interface ExportOptions {
  destinationRoot: string
  /** Output folder structure; only 'flat' exists today, date-based layouts come later */
  layout?: 'flat'
}

export async function exportKeepers(mediaPaths: string[], options: ExportOptions): Promise<ExportResult> {
  const originalsDir = join(options.destinationRoot, 'keepers')
  await mkdir(originalsDir, { recursive: true })

  const files: ExportedFile[] = []
  const log: LogEntry[] = []
  let exported = 0
  let failed = 0

  for (const sourcePath of mediaPaths) {
    try {
      const outputPath = await uniqueOutputPath(originalsDir, basename(sourcePath))
      await copyFile(sourcePath, outputPath)
      exported++
      files.push({ sourcePath, outputPath, status: 'exported' })
      log.push(logEntry('INFO', `${basename(sourcePath)}: exported`))
    } catch (err) {
      failed++
      files.push({ sourcePath, outputPath: null, status: 'failed', reason: (err as Error).message })
      log.push(logEntry('ERROR', `${basename(sourcePath)}: export failed: ${(err as Error).message}`))
    }
  }

  const reportPath = join(options.destinationRoot, 'photofind-export-report.json')
  const result: ExportResult = {
    attempted: mediaPaths.length,
    exported,
    failed,
    destinationRoot: options.destinationRoot,
    reportPath,
    files,
    log
  }

  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`)
  return result
}

async function uniqueOutputPath(dir: string, fileName: string): Promise<string> {
  const extension = extname(fileName)
  const stem = extension ? fileName.slice(0, -extension.length) : fileName
  let candidate = join(dir, fileName)
  let counter = 1

  while (await exists(candidate)) {
    candidate = join(dir, `${stem}-${counter}${extension}`)
    counter++
  }

  return candidate
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function logEntry(level: LogEntry['level'], message: string): LogEntry {
  return { level, message, timestamp: Date.now() }
}
