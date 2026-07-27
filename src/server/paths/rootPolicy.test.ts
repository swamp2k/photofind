import { mkdir, rm, symlink } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RootPolicy } from './rootPolicy'

describe('root policy', () => {
  it('enforces containment and permits missing export children', async () => {
    const base = await mkdtemp(join(tmpdir(), 'photofind-path-'))
    try {
      const photos = join(base, 'photos')
      const inbox = join(base, 'inbox')
      const exports = join(base, 'exports')
      await Promise.all([mkdir(photos), mkdir(inbox), mkdir(exports)])
      const policy = new RootPolicy({ photos, inbox, exports })
      expect(await policy.resolveUri('photofind://exports/new/folder', { allowMissing: true })).toBe(join(exports, 'new', 'folder'))
      await expect(policy.resolveUri('photofind://photos/../inbox')).rejects.toThrow()
      for (const value of ['../x', '%2e%2e/x', 'C:\\x', '\\\\server\\share', 'a\\b', 'a\0b']) {
        await expect(policy.resolve('photos', value)).rejects.toThrow()
      }
      if (process.platform !== 'win32') {
        await symlink(inbox, join(photos, 'escape'), 'junction')
        await expect(policy.resolveUri('photofind://photos/escape')).rejects.toThrow('PATH_OUTSIDE_ROOT')
      }
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
