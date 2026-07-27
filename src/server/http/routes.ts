import { createReadStream } from 'node:fs'
import { lstat, mkdir, readdir, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { PhotoFindApplication } from '../../application/PhotoFindApplication'
import type { ScannedFile, SidecarMatch } from '../../shared/types'
import { RootPolicy } from '../paths/rootPolicy'
import { decodeScopedUri } from '../paths/scopedUri'
import { validateThumbnailKey } from '../paths/thumbnailKey'
import { mapExportResult, mapRepairResult, mapScanResult } from './responseMapping'
import { ApiError, sendError } from './errors'
import type { ServerConfig } from '../config'
import packageJson from '../../../package.json'
import { classify } from '../../services/classify'

type JsonObject = Record<string, unknown>
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const body = (request: FastifyRequest): JsonObject => isObject(request.body) ? request.body : {}
const stringField = (value: unknown, name: string): string => { if (typeof value !== 'string' || value.length === 0) throw new ApiError('INVALID_REQUEST', `${name} is required`); return value }
const scopedRaw = (uri: string): string => { if (/%2e|%2f|%5c|%00/i.test(uri) || /(^|\/)\.\.?($|\/)/.test(uri) || /(^|\/)[A-Za-z]:($|\/)/.test(uri) || uri.includes('\\') || uri.includes('\0')) throw new ApiError('PATH_OUTSIDE_ROOT', 'The selected path is outside an allowed PhotoFind root.') ; return uri }
const sourceUri = (value: unknown): string => { const uri = scopedRaw(stringField(value, 'sourceUri')); const parsed = decodeScopedUri(uri); if (parsed.scope !== 'photos' && parsed.scope !== 'inbox') throw new ApiError('INVALID_SOURCE', 'Only photos and inbox may be used as sources'); return uri }
const contained = (root: string, candidate: string): boolean => { const rel = relative(root, candidate); return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) }

async function repairFile(value: unknown, policy: RootPolicy): Promise<{ file: ScannedFile; scope: 'photos' | 'inbox' }> {
  if (!isObject(value) || typeof value.path !== 'string') throw new ApiError('INVALID_MATCH', 'Malformed repair file')
  const uri = sourceUri(value.path)
  const parsed = decodeScopedUri(uri)
  let path: string
  try { path = await policy.resolveUri(uri) } catch { throw new ApiError('INVALID_MATCH', 'Repair reference is outside an allowed source') }
  try {
    const info = await stat(path)
    if (!info.isFile()) throw new Error('not-file')
    const name = basename(path)
    return { scope: parsed.scope as 'photos' | 'inbox', file: { path, name, kind: classify(name), sizeBytes: info.size } }
  } catch { throw new ApiError('INVALID_MATCH', 'Repair references must be regular files') }
}

async function validateExportOutputPath(exportRoot: string, candidate: string): Promise<void> {
  const root = await realpath(exportRoot)
  const absolute = resolve(candidate)
  if (!contained(root, absolute)) throw new ApiError('INVALID_DESTINATION', 'Export output must remain under exports')
  let current = absolute
  while (contained(root, current)) {
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new ApiError('INVALID_DESTINATION', 'Export destination contains an unsafe symlink')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (current === root) break
    current = resolve(current, '..')
  }
}

async function resolveThumbnailFile(cacheRoot: string, key: string): Promise<string> {
  const root = await realpath(cacheRoot)
  const actual = await realpath(join(root, key))
  if (!contained(root, actual) || !(await stat(actual)).isFile()) throw new Error('missing')
  return actual
}

async function mapMatches(value: unknown, policy: RootPolicy): Promise<SidecarMatch[]> {
  if (!Array.isArray(value)) throw new ApiError('INVALID_MATCH', 'matches must be an array')
  return Promise.all(value.map(async (entry) => {
    if (!isObject(entry) || !isObject(entry.media) || typeof entry.media.path !== 'string' || !['safe', 'uncertain', 'missing'].includes(String(entry.confidence))) throw new ApiError('INVALID_MATCH', 'Malformed repair match')
    const media = await repairFile(entry.media, policy)
    const sidecar = entry.sidecar === null || entry.sidecar === undefined ? null : await repairFile(entry.sidecar, policy)
    const alternates = entry.alternateSidecars === undefined ? [] : entry.alternateSidecars
    if (!Array.isArray(alternates)) throw new ApiError('INVALID_MATCH', 'alternateSidecars must be an array')
    const alternateSidecars = await Promise.all(alternates.map(async (alternate) => (await repairFile(alternate, policy))))
    const references = [media, ...(sidecar ? [sidecar] : []), ...alternateSidecars]
    if (references.some((reference) => reference.scope !== media.scope)) throw new ApiError('INVALID_MATCH', 'Repair references must use one source root')
    return { media: media.file, sidecar: sidecar?.file ?? null, alternateSidecars: alternateSidecars.map((reference) => reference.file), confidence: entry.confidence as SidecarMatch['confidence'], reason: typeof entry.reason === 'string' ? entry.reason : '' }
  }))
}

async function breadcrumbs(uri: string): Promise<Array<{ uri: string; name: string; selectable: boolean }>> {
  const parsed = decodeScopedUri(uri)
  const parts = parsed.relativePath ? parsed.relativePath.split('/') : []
  const result = [{ uri: `photofind://${parsed.scope}`, name: parsed.scope[0].toUpperCase() + parsed.scope.slice(1), selectable: true }]
  let current = `photofind://${parsed.scope}`
  for (const part of parts) { current += `/${encodeURIComponent(part)}`; result.push({ uri: current, name: part, selectable: true }) }
  return result
}

export interface ReadinessState { ready: boolean }

export async function registerRoutes(app: FastifyInstance, application: PhotoFindApplication, policy: RootPolicy, config: ServerConfig, readiness: ReadinessState = { ready: true }): Promise<void> {
  app.get('/api/health', async () => ({ ok: true }))
  app.get('/api/ready', async (request, reply) => readiness.ready
    ? reply.send({ ready: true })
    : reply.code(503).send({ error: { code: 'NOT_READY', message: 'Server is still starting', requestId: request.id } }))
  app.get('/api/capabilities', async () => ({ version: config.version ?? packageJson.version, roots: policy.capabilities(), repair: config.enableMetadataRepair, uploads: false, jobs: false, multiuser: false }))
  app.get('/api/browse', async (request, reply) => {
    try {
      const query = isObject(request.query) ? request.query : {}
      const uri = scopedRaw(typeof query.uri === 'string' ? query.uri : 'photofind://photos')
      const directory = await policy.resolveUri(uri)
      const entries = await readdir(directory, { withFileTypes: true })
      const directories: Array<{ name: string; uri: string; selectable: boolean }> = []
      let skipped = 0
      for (const entry of entries) { if (!entry.isDirectory()) continue; try { const candidate = join(directory, entry.name); if (!(await stat(candidate)).isDirectory()) { skipped++; continue }; directories.push({ name: entry.name, uri: await policy.toUri(candidate), selectable: true }) } catch { skipped++ } }
      directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      return { uri: await policy.toUri(directory), breadcrumbs: await breadcrumbs(uri), entries: directories, skipped }
    } catch (error) { return sendError(reply, error, request.id) }
  })
  app.post('/api/directories', async (request, reply) => {
    try {
      const input = body(request); const parentUri = scopedRaw(stringField(input.parentUri, 'parentUri')); const parsed = decodeScopedUri(parentUri)
      if (parsed.scope !== 'exports') throw new ApiError('INVALID_DESTINATION', 'Destination must be under exports')
      const parent = await policy.resolveUri(parentUri); if (!(await stat(parent)).isDirectory()) throw new ApiError('INVALID_DESTINATION', 'Destination must be a directory')
      const name = stringField(input.name, 'name'); if (name === '.' || name === '..' || /[\\/\0]/.test(name) || /%2e|%2f|%5c|%00/i.test(name)) throw new ApiError('INVALID_NAME', 'Invalid directory name')
      const target = await policy.resolve('exports', `${parsed.relativePath ? `${parsed.relativePath}/` : ''}${name}`, { allowMissing: true }); await mkdir(target)
      return reply.code(201).send({ uri: await policy.toUri(target) })
    } catch (error) { return sendError(reply, error, request.id) }
  })
  app.post('/api/scan', async (request, reply) => { try { const source = await policy.resolveUri(sourceUri(body(request).sourceUri)); return mapScanResult(await application.scan(source), policy) } catch (error) { return sendError(reply, error, request.id) } })
  app.post('/api/repair', async (request, reply) => { try { const input = body(request); const dryRun = input.dryRun === undefined ? true : input.dryRun; if (typeof dryRun !== 'boolean') throw new ApiError('INVALID_REQUEST', 'dryRun must be boolean'); if (!dryRun && (!config.enableMetadataRepair || input.confirm !== true)) throw new ApiError('REPAIR_DISABLED', 'Metadata writes require enabled repair mode and confirmation', 403); return mapRepairResult(await application.repair(await mapMatches(input.matches, policy), dryRun)) } catch (error) { return sendError(reply, error, request.id) } })
  app.post('/api/keepers', async (request, reply) => { try { const input = body(request); if (typeof input.kept !== 'boolean') throw new ApiError('INVALID_REQUEST', 'kept must be boolean'); const path = await policy.resolveUri(sourceUri(input.mediaUri)); try { if (!(await stat(path)).isFile()) throw new Error('not-file') } catch { throw new ApiError('INVALID_SOURCE', 'Keeper media must be a regular file') } application.setKeeper(path, input.kept); return { ok: true } } catch (error) { return sendError(reply, error, request.id) } })
  app.post('/api/export', async (request, reply) => { try { const input = body(request); const destinationUri = scopedRaw(stringField(input.destinationUri, 'destinationUri')); if (decodeScopedUri(destinationUri).scope !== 'exports') throw new ApiError('INVALID_DESTINATION', 'Export destination must be under exports'); const mediaUris = input.mediaUris; if (!Array.isArray(mediaUris) || !mediaUris.every((uri): uri is string => typeof uri === 'string')) throw new ApiError('INVALID_REQUEST', 'mediaUris must be an array of strings'); const sources = mediaUris.map((uri) => sourceUri(uri)); const sourceScopes = sources.map((uri) => decodeScopedUri(uri).scope); if (sourceScopes.some((scope) => scope !== sourceScopes[0])) throw new ApiError('INVALID_SOURCE', 'Selected media must use one source root'); const destination = await policy.resolveUri(destinationUri); let paths: string[]; try { paths = await Promise.all(sources.map((uri) => policy.resolveUri(uri))) } catch { throw new ApiError('INVALID_SOURCE', 'Each selected media item must be a regular file') } for (const path of paths) { try { if (!(await stat(path)).isFile()) throw new Error('not-file') } catch { throw new ApiError('INVALID_SOURCE', 'Each selected media item must be a regular file') } } return mapExportResult(await application.exportKeepers(paths, destination, { validateOutputPath: (path) => validateExportOutputPath(config.exportsDir, path) }), policy) } catch (error) { return sendError(reply, error, request.id) } })
  app.get('/api/thumbnails/:key', async (request, reply) => { try { const params = request.params as { key?: unknown }; const key = validateThumbnailKey(stringField(params.key, 'key')); const file = await resolveThumbnailFile(config.cacheDir, key); reply.header('content-type', 'image/webp').header('cache-control', 'public, max-age=31536000, immutable'); return reply.send(createReadStream(file)) } catch { return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Thumbnail not found', requestId: request.id } }) } })
}
