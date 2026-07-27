import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import { decodeScopedUri, encodeScopedUri, type PublicRoot } from './scopedUri'

export interface RootCapability { scope: PublicRoot; browse: boolean; scan: boolean; createDestination: boolean; export: boolean }
export type RootConfig = Partial<Record<PublicRoot, string>> & { cache?: string; config?: string }

function contained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export class RootPolicy {
  private readonly roots: Readonly<Record<PublicRoot, string>>
  constructor(config: RootConfig) {
    if (!config.photos || !config.inbox || !config.exports) throw new Error('photos, inbox and exports roots are required')
    this.roots = { photos: resolve(config.photos), inbox: resolve(config.inbox), exports: resolve(config.exports) }
  }

  capability(scope: PublicRoot): RootCapability {
    return { scope, browse: true, scan: scope === 'photos' || scope === 'inbox', createDestination: scope === 'exports', export: scope === 'exports' }
  }

  capabilities(): RootCapability[] { return (['photos', 'inbox', 'exports'] as PublicRoot[]).map((scope) => this.capability(scope)) }

  async resolve(scope: PublicRoot, relativePath = '', options: { allowMissing?: boolean } = {}): Promise<string> {
    if (relativePath.includes('\0') || relativePath.includes('\\') || /%2f|%5c|%2e/i.test(relativePath) || /(^|\/)\.\.?($|\/)/.test(relativePath) || isAbsolute(relativePath) || win32.isAbsolute(relativePath) || /^\\\\/.test(relativePath)) throw new Error('PATH_OUTSIDE_ROOT')
    const root = await realpath(this.roots[scope])
    const candidate = resolve(root, relativePath)
    if (!contained(root, candidate)) throw new Error('PATH_OUTSIDE_ROOT')
    try {
      const actual = await realpath(candidate)
      if (!contained(root, actual)) throw new Error('PATH_OUTSIDE_ROOT')
      return actual
    } catch (error) {
      if (!options.allowMissing || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      let parent = candidate
      while (parent !== root) {
        try {
          const actualParent = await realpath(parent)
          if (!contained(root, actualParent)) throw new Error('PATH_OUTSIDE_ROOT')
          return candidate
        } catch (parentError) {
          if ((parentError as NodeJS.ErrnoException).code !== 'ENOENT') throw parentError
          parent = resolve(parent, '..')
        }
      }
      return candidate
    }
  }

  async resolveUri(uri: string, options?: { allowMissing?: boolean }): Promise<string> {
    const parsed = decodeScopedUri(uri)
    return this.resolve(parsed.scope, parsed.relativePath, options)
  }

  async toUri(path: string): Promise<string> {
    const absolute = resolve(path)
    for (const scope of ['photos', 'inbox', 'exports'] as PublicRoot[]) {
      const root = await realpath(this.roots[scope])
      const actual = await realpath(absolute)
      if (contained(root, actual)) return encodeScopedUri(scope, relative(root, actual).split(sep).join('/'))
    }
    throw new Error('PATH_OUTSIDE_ROOT')
  }
}

export const createRootPolicy = (config: RootConfig): RootPolicy => new RootPolicy(config)
export async function resolveScopedPath(policy: RootPolicy, uri: string, options?: { allowMissing?: boolean }): Promise<string> {
  return policy.resolveUri(uri, options)
}

export async function validateContainedPath(root: string, candidate: string, allowMissing = false): Promise<string> {
  return new RootPolicy({ photos: root, inbox: root, exports: root }).resolve('photos', relative(resolve(root), resolve(candidate)), { allowMissing })
}
