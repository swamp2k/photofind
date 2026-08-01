import { describe, expect, it } from 'vitest'
import { isInExactSourceFolder, sourceFolderLabel, sourceFolderOf, summarizeSourceFolders, topLevelSourceFolder } from './sourcePath'

describe('source folder helpers', () => {
  it('normalizes parent folders and library-root files', () => {
    expect(sourceFolderOf('Trips/2025/IMG_1.jpg')).toBe('Trips/2025')
    expect(sourceFolderOf('Trips\\2025\\IMG_1.jpg')).toBe('Trips/2025')
    expect(sourceFolderOf('IMG_1.jpg')).toBe('')
    expect(sourceFolderLabel('')).toBe('Library root')
  })

  it('matches only the exact parent folder', () => {
    expect(isInExactSourceFolder({ relativePath: 'Trips/2025/IMG_1.jpg' }, 'Trips/2025')).toBe(true)
    expect(isInExactSourceFolder({ relativePath: 'Trips/2025/Sub/IMG_1.jpg' }, 'Trips/2025')).toBe(false)
  })

  it('summarizes duplicate sources by folder', () => {
    expect(summarizeSourceFolders([
      { relativePath: 'Backup A/IMG.jpg' },
      { relativePath: 'Backup B/IMG.jpg' },
      { relativePath: 'Backup A/IMG copy.jpg' }
    ])).toEqual([
      { folder: 'Backup A', count: 2 },
      { folder: 'Backup B', count: 1 }
    ])
  })

  it('extracts the top-level source folder', () => {
    expect(topLevelSourceFolder('Takeout/Google Photos/2024/IMG.jpg')).toBe('Takeout')
    expect(topLevelSourceFolder('IMG.jpg')).toBe('')
  })
})
