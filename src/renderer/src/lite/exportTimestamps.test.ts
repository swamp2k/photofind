import { describe, expect, it } from 'vitest'
import { buildTimestampArtifacts } from './exportTimestamps'

describe('timestamp restoration artifacts', () => {
  it('records original modified times and generates local restore scripts', () => {
    const artifacts = buildTimestampArtifacts([
      { path: '2011/06 - Motorcycle trip/IMG_1.JPG', lastModifiedMs: 1_300_000_000_000 }
    ], 'test')

    expect(artifacts.jsonName).toBe('photofind-original-modified-times-test.json')
    expect(artifacts.pythonName).toBe('photofind-restore-modified-times-test.py')
    expect(artifacts.powershellName).toBe('photofind-restore-modified-times-test.ps1')
    expect(artifacts.json).toContain('2011/06 - Motorcycle trip/IMG_1.JPG')
    expect(artifacts.json).toContain('1300000000000')
    expect(artifacts.python).toContain('os.utime')
    expect(artifacts.python).toContain(artifacts.jsonName)
    expect(artifacts.powershell).toContain('SetLastWriteTimeUtc')
    expect(artifacts.powershell).toContain(artifacts.jsonName)
  })
})
