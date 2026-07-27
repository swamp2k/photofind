import { copyFile, lstat, mkdir, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { ExportResult, ExportedFile, LogEntry } from '../shared/types'

export interface ExportOptions {
  destinationRoot: string
  validateOutputPath?: (path: string) => void | Promise<void>
}

export async function exportKeepers(mediaPaths: string[], options: ExportOptions): Promise<ExportResult> {
  const originalsDir = join(options.destinationRoot, 'keepers')
  await options.validateOutputPath?.(originalsDir)
  await mkdir(originalsDir, { recursive: true })

  const files: ExportedFile[] = []
  const log: LogEntry[] = []
  let exported = 0
  let failed = 0

  for (const sourcePath of mediaPaths) {
    try {
      const outputPath = await copyUnique(sourcePath, originalsDir, options.validateOutputPath)
      exported++
      files.push({ sourcePath, outputPath, status: 'exported' })
      log.push(logEntry('INFO', `${basename(sourcePath)}: exported`))
    } catch (err) {
      failed++
      files.push({ sourcePath, outputPath: null, status: 'failed', reason: (err as Error).message })
      log.push(logEntry('ERROR', `${basename(sourcePath)}: export failed: ${(err as Error).message}`))
    }
  }

  const reportPath = await uniqueOutputPath(options.destinationRoot, 'photofind-export-report.json')
  const result: ExportResult = {
    attempted: mediaPaths.length,
    exported,
    failed,
    destinationRoot: options.destinationRoot,
    reportPath,
    files,
    log
  }

  await options.validateOutputPath?.(reportPath)

  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
  return result
}

async function copyUnique(sourcePath: string, directory: string, validateOutputPath?: ExportOptions['validateOutputPath']): Promise<string> {
  for (;;) {
    const outputPath = await uniqueOutputPath(directory, basename(sourcePath))
    await validateOutputPath?.(outputPath)
    try {
      await copyFile(sourcePath, outputPath, constants.COPYFILE_EXCL)
      return outputPath
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
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
    await lstat(path)
    return true
  } catch {
    return false
  }
}

function logEntry(level: LogEntry['level'], message: string): LogEntry {
  return { level, message, timestamp: Date.now() }
}
