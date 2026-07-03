import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractZips } from './zipImport'

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'photofind-zip-test-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function writeZip(name: string, entries: Record<string, string>): string {
  const zip = new AdmZip()
  for (const [entryName, content] of Object.entries(entries)) {
    zip.addFile(entryName, Buffer.from(content))
  }
  const zipPath = join(workDir, name)
  zip.writeZip(zipPath)
  return zipPath
}

describe('extractZips', () => {
  it('merges files from multiple zip parts into one directory', async () => {
    const destDir = join(workDir, 'dest')
    const zip1 = writeZip('part1.zip', { 'Takeout/Google Photos/IMG_1.jpg': 'aaa' })
    const zip2 = writeZip('part2.zip', { 'Takeout/Google Photos/IMG_2.jpg': 'bbb' })

    const result = await extractZips([zip1, zip2], destDir)

    expect(result.extracted).toBe(2)
    expect(result.conflicts).toBe(0)
    expect(readFileSync(join(destDir, 'Takeout/Google Photos/IMG_1.jpg'), 'utf-8')).toBe('aaa')
    expect(readFileSync(join(destDir, 'Takeout/Google Photos/IMG_2.jpg'), 'utf-8')).toBe('bbb')
  })

  it('skips a file repeated across zip parts when it is identical', async () => {
    const destDir = join(workDir, 'dest')
    const zip1 = writeZip('part1.zip', { 'Takeout/Google Photos/IMG_1.jpg': 'same-content' })
    const zip2 = writeZip('part2.zip', { 'Takeout/Google Photos/IMG_1.jpg': 'same-content' })

    const result = await extractZips([zip1, zip2], destDir)

    expect(result.extracted).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.conflicts).toBe(0)
  })

  it('flags a name conflict and keeps the first copy when sizes differ', async () => {
    const destDir = join(workDir, 'dest')
    const zip1 = writeZip('part1.zip', { 'Takeout/Google Photos/IMG_1.jpg': 'first-copy' })
    const zip2 = writeZip('part2.zip', { 'Takeout/Google Photos/IMG_1.jpg': 'a-different-second-copy' })

    const result = await extractZips([zip1, zip2], destDir)

    expect(result.extracted).toBe(1)
    expect(result.conflicts).toBe(1)
    expect(readFileSync(join(destDir, 'Takeout/Google Photos/IMG_1.jpg'), 'utf-8')).toBe('first-copy')
    expect(result.log.some((l) => l.level === 'WARN' && l.message.includes('different size'))).toBe(true)
  })
})
