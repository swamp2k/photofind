import { describe, expect, it } from 'vitest'
import { decodeScopedUri, encodeScopedUri } from './scopedUri'

describe('scoped PhotoFind URIs', () => {
  it('encodes canonical segments on every host', () => {
    expect(encodeScopedUri('photos', 'Family/2024')).toBe('photofind://photos/Family/2024')
    expect(encodeScopedUri('inbox', 'Baby swim 2026')).toBe('photofind://inbox/Baby%20swim%202026')
    expect(decodeScopedUri('photofind://photos/Family/2024')).toEqual({ scope: 'photos', relativePath: 'Family/2024' })
  })
  it('rejects traversal, malformed encoding, absolute and separator tricks', () => {
    for (const value of ['photofind://photos/../secret', 'photofind://photos/%2e%2e/secret', 'photofind://photos/a%2Fb', 'photofind://photos/a%5Cb', 'photofind://photos/%00', 'photofind://photos/%E0%A4%A', 'photofind://photos/C:%5Csecret', 'photofind://photos/%5C%5Cserver%5Cshare']) expect(() => decodeScopedUri(value)).toThrow()
    expect(() => encodeScopedUri('photos', 'C:\\secret')).toThrow()
  })
})
