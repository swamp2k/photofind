import { isAbsolute, win32 } from 'node:path'

const isUnc = (value: string): boolean => /^\\\\/.test(value)

export type PublicRoot = 'photos' | 'inbox' | 'exports'
export const PUBLIC_ROOTS: readonly PublicRoot[] = ['photos', 'inbox', 'exports']

function rejectSegment(segment: string): void {
  if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
    throw new Error('Invalid scoped path segment')
  }
  if (isAbsolute(segment) || win32.isAbsolute(segment) || isUnc(segment)) throw new Error('Absolute paths are not allowed')
}

export function encodeScopedUri(scope: PublicRoot, relativePath = ''): string {
  if (!PUBLIC_ROOTS.includes(scope)) throw new Error('Unknown PhotoFind root')
  const normalized = relativePath
  if (normalized.includes('\\') || normalized.includes('\0')) throw new Error('Invalid scoped path')
  if (normalized && (isAbsolute(normalized) || win32.isAbsolute(normalized) || isUnc(normalized))) throw new Error('Absolute paths are not allowed')
  const segments = normalized.split('/').filter(Boolean)
  segments.forEach(rejectSegment)
  return `photofind://${scope}${segments.length ? `/${segments.map(encodeURIComponent).join('/')}` : ''}`
}

export function decodeScopedUri(value: string): { scope: PublicRoot; relativePath: string } {
  if (/\/\.\.?\//.test(value) || /%2e/i.test(value)) throw new Error('Invalid scoped path')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('Malformed PhotoFind URI') }
  if (parsed.protocol !== 'photofind:' || parsed.search || parsed.hash || !PUBLIC_ROOTS.includes(parsed.hostname as PublicRoot)) throw new Error('Malformed PhotoFind URI')
  const raw = parsed.pathname.replace(/^\//, '')
  if (!raw) return { scope: parsed.hostname as PublicRoot, relativePath: '' }
  const segments = raw.split('/')
  const decoded = segments.map((part) => {
    let result: string
    try { result = decodeURIComponent(part) } catch { throw new Error('Malformed percent encoding') }
    rejectSegment(result)
    return result
  })
  return { scope: parsed.hostname as PublicRoot, relativePath: decoded.join('/') }
}

export const scopedUriForPath = encodeScopedUri
export const parseScopedUri = decodeScopedUri
