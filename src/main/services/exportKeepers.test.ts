import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { exportKeepers } from './exportKeepers'

describe('exportKeepers', () => {
  it('copies keeper originals and writes an export report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-export-'))
    try {
      const sourceA = join(root, 'IMG_0001.jpg')
      const sourceB = join(root, 'IMG_0002.jpg')
      const destination = join(root, 'out')
      await writeFile(sourceA, 'one')
      await writeFile(sourceB, 'two')

      const result = await exportKeepers([sourceA, sourceB], { destinationRoot: destination })

      expect(result.attempted).toBe(2)
      expect(result.exported).toBe(2)
      expect(result.failed).toBe(0)
      expect(await readFile(join(destination, 'keepers', 'IMG_0001.jpg'), 'utf-8')).toBe('one')
      expect(await readFile(join(destination, 'keepers', 'IMG_0002.jpg'), 'utf-8')).toBe('two')

      const report = JSON.parse(await readFile(result.reportPath, 'utf-8')) as typeof result
      expect(report.exported).toBe(2)
      expect(report.files.map((file) => file.status)).toEqual(['exported', 'exported'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not overwrite existing exported files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-export-'))
    try {
      const source = join(root, 'IMG_0001.jpg')
      const destination = join(root, 'out')
      await writeFile(source, 'new')
      await mkdir(join(destination, 'keepers'), { recursive: true })
      await writeFile(join(destination, 'keepers', 'IMG_0001.jpg'), 'existing')

      const result = await exportKeepers([source], { destinationRoot: destination })

      expect(result.files[0].outputPath).toBe(join(destination, 'keepers', 'IMG_0001-1.jpg'))
      expect(await readFile(join(destination, 'keepers', 'IMG_0001.jpg'), 'utf-8')).toBe('existing')
      expect(await readFile(join(destination, 'keepers', 'IMG_0001-1.jpg'), 'utf-8')).toBe('new')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
