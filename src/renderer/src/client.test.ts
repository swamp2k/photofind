import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhotoFindHttpError, httpClient } from './client'
import { formatDirectoryDisplay } from './components/MountedDirectoryPicker'

afterEach(() => vi.unstubAllGlobals())

describe('browser HTTP client', () => {
  it('formats scoped browser paths without exposing internal URIs', () => {
    expect(formatDirectoryDisplay('photofind://photos/Family%20Album/2024')).toBe('Photos / Family Album / 2024')
    expect(formatDirectoryDisplay('photofind://exports')).toBe('Exports')
    expect(formatDirectoryDisplay('C:/Photos')).toBe('C:/Photos')
  })

  it('parses successful JSON and sends scoped URI payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await httpClient.setKeeper('photofind://photos/album/a.jpg', true)
    expect(fetchMock).toHaveBeenCalledWith('/api/keepers', expect.objectContaining({ method: 'POST', body: JSON.stringify({ mediaUri: 'photofind://photos/album/a.jpg', kept: true }) }))
  })

  it('maps structured API errors to a typed error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'REPAIR_DISABLED', message: 'disabled' } }), { status: 403 })))
    await expect(httpClient.runRepair([], false, true)).rejects.toMatchObject({ code: 'REPAIR_DISABLED', status: 403, message: 'disabled' } satisfies Partial<PhotoFindHttpError>)
  })
})
