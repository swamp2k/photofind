import { access, mkdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export interface ServerConfig { host:string; port:number; configDir:string; cacheDir:string; photosDir:string; inboxDir:string; exportsDir:string; enableMetadataRepair:boolean; staticDir?:string; version?: string }
export function parseServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const local = resolve(process.cwd(), '.photofind-data')
  const port = Number(env.PHOTOFIND_PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PHOTOFIND_PORT')
  return { host: env.PHOTOFIND_HOST ?? '127.0.0.1', port, configDir: resolve(env.PHOTOFIND_CONFIG_DIR ?? `${local}/config`), cacheDir: resolve(env.PHOTOFIND_CACHE_DIR ?? `${local}/cache`), photosDir: resolve(env.PHOTOFIND_PHOTOS_DIR ?? `${local}/photos`), inboxDir: resolve(env.PHOTOFIND_INBOX_DIR ?? `${local}/inbox`), exportsDir: resolve(env.PHOTOFIND_EXPORTS_DIR ?? `${local}/exports`), enableMetadataRepair: /^(1|true|yes)$/i.test(env.PHOTOFIND_ENABLE_METADATA_REPAIR ?? ''), staticDir: env.PHOTOFIND_STATIC_DIR ? resolve(env.PHOTOFIND_STATIC_DIR) : undefined }
}
export async function prepareServerConfig(config: ServerConfig): Promise<void> {
  try {
    const writableRoots = [config.configDir, config.cacheDir, config.inboxDir, config.exportsDir]
    await Promise.all(writableRoots.map((dir) => mkdir(dir, { recursive:true })))
    await Promise.all(writableRoots.map((dir) => access(dir, 2)))
    const source = await stat(config.photosDir)
    if (!source.isDirectory()) throw new Error('PHOTOS_SOURCE_NOT_DIRECTORY')
    await access(config.photosDir, 4)
    const roots = {
      photos: await realpath(config.photosDir),
      inbox: await realpath(config.inboxDir),
      exports: await realpath(config.exportsDir),
      config: await realpath(config.configDir),
      cache: await realpath(config.cacheDir)
    }
    const contained = (root: string, candidate: string): boolean => {
      const rel = relative(root, candidate)
      return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
    }
    const publicRoots = [roots.photos, roots.inbox, roots.exports]
    const privateRoots = [roots.config, roots.cache]
    if (publicRoots.some((root, index) => publicRoots.some((other, otherIndex) => index !== otherIndex && (contained(root, other) || contained(other, root))))) throw new Error('CONFIGURATION_ROOT_OVERLAP')
    if (publicRoots.some((root) => privateRoots.some((other) => contained(root, other) || contained(other, root)))) throw new Error('CONFIGURATION_ROOT_OVERLAP')
    if (privateRoots.some((root, index) => privateRoots.some((other, otherIndex) => index !== otherIndex && (contained(root, other) || contained(other, root))))) throw new Error('CONFIGURATION_ROOT_OVERLAP')
    config.photosDir = roots.photos; config.inboxDir = roots.inbox; config.exportsDir = roots.exports
    config.configDir = roots.config; config.cacheDir = roots.cache
    if (config.staticDir) {
      const staticRoot = await stat(config.staticDir)
      if (!staticRoot.isDirectory()) throw new Error('STATIC_ROOT_UNAVAILABLE')
      await access(config.staticDir, 4)
      const canonicalStatic = await realpath(config.staticDir)
      if (publicRoots.some((root) => contained(root, canonicalStatic) || contained(canonicalStatic, root)) || privateRoots.some((root) => contained(root, canonicalStatic) || contained(canonicalStatic, root))) throw new Error('CONFIGURATION_ROOT_OVERLAP')
      try {
        if (!(await stat(resolve(canonicalStatic, 'index.html'))).isFile()) throw new Error('missing-index')
      } catch { throw new Error('STATIC_ROOT_UNAVAILABLE') }
      config.staticDir = canonicalStatic
    }
  } catch (error) {
    const code = error instanceof Error && ['PHOTOS_SOURCE_NOT_DIRECTORY', 'STATIC_ROOT_UNAVAILABLE', 'CONFIGURATION_ROOT_OVERLAP'].includes(error.message) ? error.message : 'CONFIGURATION_UNAVAILABLE'
    throw new Error(code)
  }
}
