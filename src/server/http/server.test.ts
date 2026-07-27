import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { createTakeoutFixture } from '../../test/takeoutFixture'
import { createServer } from '../app'
import { prepareServerConfig } from '../config'
import { PhotoFindApplication } from '../../application/PhotoFindApplication'
import { RootPolicy } from '../paths/rootPolicy'
import { registerRoutes } from './routes'

describe('HTTP server adapter', () => {
  it('serves health, capabilities and scoped browse responses', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-'))
    const dirs = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports') }
    await mkdir(join(dirs.photosDir, 'Family'), { recursive:true })
    const server = await createServer({ config:{ ...dirs, host:'127.0.0.1', port:0, enableMetadataRepair:false } })
    try {
      expect((await server.app.inject('/api/health')).statusCode).toBe(200)
      expect((await server.app.inject('/api/ready')).json()).toEqual({ ready:true })
      const browse = await server.app.inject('/api/browse?uri=photofind://photos')
      expect(browse.statusCode).toBe(200)
      expect(browse.json().entries[0].uri).toBe('photofind://photos/Family')
      expect(browse.json().entries[0].selectable).toBe(true)
      const traversal = await server.app.inject('/api/browse?uri=photofind://photos/%2e%2e')
      expect(traversal.statusCode).toBe(400)
    } finally { await server.close(); await rm(root, { recursive:true, force:true }) }
  })
})

describe('HTTP lifecycle safety', () => {
  it('returns a safe 503 readiness envelope while startup is incomplete', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-ready-'))
    const dirs = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports') }
    await mkdir(dirs.photosDir, { recursive:true })
    await mkdir(dirs.configDir, { recursive:true }); await mkdir(dirs.cacheDir, { recursive:true }); await mkdir(dirs.inboxDir, { recursive:true }); await mkdir(dirs.exportsDir, { recursive:true })
    const application = new PhotoFindApplication({ databasePath: join(dirs.configDir, 'photofind.sqlite'), thumbnailCacheRoot: dirs.cacheDir })
    const app = Fastify()
    const policy = new RootPolicy({ photos: dirs.photosDir, inbox: dirs.inboxDir, exports: dirs.exportsDir })
    const readiness = { ready: false }
    await registerRoutes(app, application, policy, { ...dirs, host:'127.0.0.1', port:0, enableMetadataRepair:false }, readiness)
    try {
      const response = await app.inject('/api/ready')
      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ error: { code:'NOT_READY', message:'Server is still starting', requestId:expect.any(String) } })
      expect(response.body).not.toContain(root)
    } finally { await app.close(); application.close(); await rm(root, { recursive:true, force:true }) }
  })

  it('allows only one application per database path and releases it on close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-singleton-'))
    const dirs = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports') }
    await mkdir(dirs.photosDir, { recursive:true })
    const config = { ...dirs, host:'127.0.0.1', port:0, enableMetadataRepair:false }
    const first = await createServer({ config })
    try {
      await expect(createServer({ config })).rejects.toThrow('DATABASE_IN_USE')
    } finally { await first.close() }
    const reopened = await createServer({ config })
    await reopened.close()
    await rm(root, { recursive:true, force:true })
  })
})

describe('HTTP error safety', () => {
  it('rejects directory keepers, non-file repair references and mixed-root matches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-boundaries-'))
    const dirs = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports') }
    await mkdir(join(dirs.photosDir, 'folder'), { recursive:true }); await mkdir(dirs.inboxDir, { recursive:true })
    await writeFile(join(dirs.photosDir, 'image.jpg'), 'image'); await writeFile(join(dirs.photosDir, 'image.jpg.json'), '{}'); await writeFile(join(dirs.inboxDir, 'other.json'), '{}')
    const server = await createServer({ config:{ ...dirs, host:'127.0.0.1', port:0, enableMetadataRepair:false } })
    try {
      const keeper = await server.app.inject({ method:'POST', url:'/api/keepers', payload:{ mediaUri:'photofind://photos/folder', kept:true } })
      expect(keeper.statusCode).toBe(400); expect(keeper.json().error.code).toBe('INVALID_SOURCE')
      const repair = await server.app.inject({ method:'POST', url:'/api/repair', payload:{ dryRun:true, matches:[{ media:{ path:'photofind://photos/folder' }, sidecar:null, alternateSidecars:[], confidence:'missing' }] } })
      expect(repair.statusCode).toBe(400); expect(repair.json().error.code).toBe('INVALID_MATCH')
      const mixed = await server.app.inject({ method:'POST', url:'/api/repair', payload:{ dryRun:true, matches:[{ media:{ path:'photofind://photos/image.jpg' }, sidecar:{ path:'photofind://inbox/other.json' }, alternateSidecars:[], confidence:'safe' }] } })
      expect(mixed.statusCode).toBe(400); expect(mixed.json().error.code).toBe('INVALID_MATCH')
      const mixedExport = await server.app.inject({ method:'POST', url:'/api/export', payload:{ mediaUris:['photofind://photos/image.jpg', 'photofind://inbox/other.json'], destinationUri:'photofind://exports' } })
      expect(mixedExport.statusCode).toBe(400); expect(mixedExport.json().error.code).toBe('INVALID_SOURCE')
    } finally { await server.close(); await rm(root, { recursive:true, force:true }) }
  })

  it('returns a correlated safe envelope for malformed JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-errors-'))
    const dirs = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports') }
    await mkdir(dirs.photosDir, { recursive:true })
    const server = await createServer({ config:{ ...dirs, host:'127.0.0.1', port:0, enableMetadataRepair:false } })
    try {
      const response = await server.app.inject({ method:'POST', url:'/api/scan', headers:{'content-type':'application/json'}, payload:'{"sourceUri":' })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ error:{ code:'INVALID_JSON', message:'Request body must be valid JSON', requestId:expect.any(String) } })
      expect(response.body).not.toContain('FST_ERR')
    } finally { await server.close(); await rm(root, { recursive:true, force:true }) }
  })

  it('rejects missing and non-file export sources without exposing fixture paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-export-errors-'))
    const dirs = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports') }
    await mkdir(join(dirs.photosDir, 'folder'), { recursive:true })
    const server = await createServer({ config:{ ...dirs, host:'127.0.0.1', port:0, enableMetadataRepair:false } })
    try {
      for (const uri of ['photofind://photos/missing.jpg', 'photofind://photos/folder']) {
        const response = await server.app.inject({ method:'POST', url:'/api/export', payload:{ mediaUris:[uri], destinationUri:'photofind://exports' } })
        expect(response.statusCode).toBe(400); expect(response.body).not.toContain(root); expect(response.json().error.requestId).toEqual(expect.any(String))
      }
    } finally { await server.close(); await rm(root, { recursive:true, force:true }) }
  })
})

describe('server configuration safety', () => {
  it('rejects missing photos source without leaking its path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-config-errors-'))
    const config = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'missing-photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports'), host:'127.0.0.1', port:0, enableMetadataRepair:false }
    try { await expect(prepareServerConfig(config)).rejects.toThrow('CONFIGURATION_UNAVAILABLE') } finally { await rm(root, { recursive:true, force:true }) }
  })

  it('rejects direct root overlaps without leaking paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-config-overlap-'))
    const config = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'shared'), inboxDir:join(root,'shared','inbox'), exportsDir:join(root,'exports'), host:'127.0.0.1', port:0, enableMetadataRepair:false }
    await mkdir(config.photosDir, { recursive:true })
    try { await expect(prepareServerConfig(config)).rejects.toThrow('CONFIGURATION_ROOT_OVERLAP') } finally { await rm(root, { recursive:true, force:true }) }
  })

  it('rejects overlapping private roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-config-private-overlap-'))
    const config = { configDir:join(root,'state'), cacheDir:join(root,'state','cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports'), host:'127.0.0.1', port:0, enableMetadataRepair:false }
    await mkdir(config.photosDir, { recursive:true })
    try { await expect(prepareServerConfig(config)).rejects.toThrow('CONFIGURATION_ROOT_OVERLAP') } finally { await rm(root, { recursive:true, force:true }) }
  })

  it.runIf(process.platform !== 'win32')('rejects symlink-alias overlaps', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-config-alias-'))
    const real = join(root, 'real'); const alias = join(root, 'alias')
    await mkdir(real, { recursive:true }); await symlink(real, alias, 'junction')
    const config = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:real, inboxDir:alias, exportsDir:join(root,'exports'), host:'127.0.0.1', port:0, enableMetadataRepair:false }
    try { await expect(prepareServerConfig(config)).rejects.toThrow('CONFIGURATION_ROOT_OVERLAP') } finally { await rm(root, { recursive:true, force:true }) }
  })

  it('rejects static roots overlapping protected data roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-config-static-overlap-'))
    const photosDir = join(root, 'photos')
    const config = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir, inboxDir:join(root,'inbox'), exportsDir:join(root,'exports'), staticDir:photosDir, host:'127.0.0.1', port:0, enableMetadataRepair:false }
    await mkdir(photosDir, { recursive:true }); await writeFile(join(photosDir, 'sentinel.txt'), 'private')
    try { await expect(prepareServerConfig(config)).rejects.toThrow('CONFIGURATION_ROOT_OVERLAP') } finally { await rm(root, { recursive:true, force:true }) }
  })
})

describe('HTTP workflow and safety', () => {
  it('runs the existing workflow without leaking internal paths or escaping configured roots', async () => {
    const photos = await createTakeoutFixture()
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-workflow-'))
    const dirs = {
      configDir: join(root, 'config'),
      cacheDir: join(root, 'cache'),
      photosDir: photos.root,
      inboxDir: join(root, 'inbox'),
      exportsDir: join(root, 'exports')
    }
    const server = await createServer({ config: { ...dirs, host: '127.0.0.1', port: 0, enableMetadataRepair: false } })
    try {
      const health = await server.app.inject('/api/health')
      expect(health.statusCode).toBe(200)
      expect(health.headers['x-content-type-options']).toBe('nosniff')
      expect(health.headers['access-control-allow-origin']).toBeUndefined()
      expect((await server.app.inject('/api/capabilities')).json()).toMatchObject({ version: '0.1.0', uploads: false, jobs: false, multiuser: false })

      const rootBrowse = await server.app.inject('/api/browse?uri=photofind://photos')
      expect(rootBrowse.json().breadcrumbs[0]).toEqual({ uri: 'photofind://photos', name: 'Photos', selectable: true })
      const create = await server.app.inject({ method: 'POST', url: '/api/directories', payload: { parentUri: 'photofind://exports', name: 'selected' } })
      expect(create.statusCode).toBe(201)
      expect(create.json().uri).toBe('photofind://exports/selected')

      for (const uri of ['photofind://photos/../secret', 'photofind://photos/%2e%2e/secret', 'photofind://photos/C:%5Csecret', 'photofind://photos/%5C%5Cserver%5Cshare', 'photofind://photos/a%5Cb', 'photofind://photos/%00']) {
        const response = await server.app.inject(`/api/browse?uri=${uri}`)
        expect(response.statusCode).toBe(400)
        expect(response.json().error.requestId).toEqual(expect.any(String))
      }

      if (process.platform !== 'win32') {
        await symlink(root, join(photos.root, 'outside'), 'junction')
        const browse = await server.app.inject('/api/browse?uri=photofind://photos')
        expect(browse.json().entries.map((entry: { name: string }) => entry.name)).not.toContain('outside')
      }

      const scan = await server.app.inject({ method: 'POST', url: '/api/scan', payload: { sourceUri: 'photofind://photos' } })
      expect(scan.statusCode).toBe(200)
      const scanResult = scan.json()
      expect(JSON.stringify(scanResult)).not.toContain(photos.root)
      expect(JSON.stringify(scanResult)).not.toContain(dirs.cacheDir)
      expect(scanResult.matches[0].media.path).toMatch(/^photofind:\/\/photos\//)
      expect(scanResult.thumbnails.items[0].thumbnailUrl).toMatch(/^\/api\/thumbnails\/[a-f0-9]{24}\.webp$/)
      expect(scanResult.thumbnails.items[0].thumbnailPath).toBeNull()

      const thumbnail = await server.app.inject(scanResult.thumbnails.items[0].thumbnailUrl)
      expect(thumbnail.statusCode).toBe(200)
      expect(thumbnail.headers['content-type']).toContain('image/webp')
      const missingThumbnail = await server.app.inject('/api/thumbnails/0123456789abcdef01234567.webp')
      expect(missingThumbnail.statusCode).toBe(404)
      expect(missingThumbnail.json().error.requestId).toEqual(expect.any(String))
      expect((await server.app.inject('/api/thumbnails/../package.json')).statusCode).toBe(404)

      const dryRepair = await server.app.inject({ method: 'POST', url: '/api/repair', payload: { dryRun: true, matches: scanResult.matches } })
      expect(dryRepair.statusCode).toBe(200)
      const disabledRepair = await server.app.inject({ method: 'POST', url: '/api/repair', payload: { dryRun: false, confirm: true, matches: scanResult.matches } })
      expect(disabledRepair.statusCode).toBe(403)

      const mediaUri = scanResult.matches[0].media.path
      expect((await server.app.inject({ method: 'POST', url: '/api/keepers', payload: { mediaUri, kept: true } })).statusCode).toBe(200)
      const rescan = await server.app.inject({ method: 'POST', url: '/api/scan', payload: { sourceUri: 'photofind://photos' } })
      expect(rescan.json().keepers).toContain(mediaUri)

      const collision = join(dirs.exportsDir, 'keepers', 'IMG_1001.JPG')
      await mkdir(join(dirs.exportsDir, 'keepers'), { recursive: true })
      await writeFile(collision, 'keep this existing export')
      const exported = await server.app.inject({ method: 'POST', url: '/api/export', payload: { mediaUris: [mediaUri], destinationUri: 'photofind://exports' } })
      expect(exported.statusCode).toBe(200)
      expect(exported.json().files[0].outputPath).toBe('photofind://exports/keepers/IMG_1001-1.JPG')
      expect(await readFile(collision, 'utf8')).toBe('keep this existing export')

      expect((await server.app.inject({ method: 'POST', url: '/api/scan', payload: { sourceUri: 'photofind://exports' } })).statusCode).toBe(400)
      const notFound = await server.app.inject('/api/not-a-route')
      expect(notFound.statusCode).toBe(404)
      expect(notFound.json().error.requestId).toEqual(expect.any(String))
    } finally {
      await server.close()
      await photos.cleanup()
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('HTTP symlink containment', () => {
  it.runIf(process.platform !== 'win32')('does not follow export or thumbnail symlinks outside configured roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-symlink-'))
    const dirs = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports') }
    const outside = join(root, 'outside'); const source = join(dirs.photosDir, 'image.jpg'); const key = '0123456789abcdef01234567.webp'
    await mkdir(dirs.photosDir, { recursive: true }); await mkdir(dirs.cacheDir, { recursive: true }); await mkdir(dirs.exportsDir, { recursive: true }); await mkdir(outside, { recursive: true })
    await writeFile(source, 'source'); await writeFile(join(outside, 'report.json'), 'outside-report'); await writeFile(join(outside, key), 'secret-thumbnail')
    await symlink(outside, join(dirs.cacheDir, key), 'junction')
    const server = await createServer({ config:{ ...dirs, host:'127.0.0.1', port:0, enableMetadataRepair:false } })
    try {
      const thumbnail = await server.app.inject(`/api/thumbnails/${key}`)
      expect(thumbnail.statusCode).toBe(404); expect(thumbnail.body).not.toContain('secret-thumbnail')
    } finally { await server.close(); await rm(root, { recursive:true, force:true }) }

    const exportRoot = await mkdtemp(join(tmpdir(), 'photofind-http-export-symlink-'))
    const exportDirs = { configDir:join(exportRoot,'config'), cacheDir:join(exportRoot,'cache'), photosDir:join(exportRoot,'photos'), inboxDir:join(exportRoot,'inbox'), exportsDir:join(exportRoot,'exports') }
    const exportOutside = join(exportRoot, 'outside'); await mkdir(exportDirs.photosDir, { recursive:true }); await mkdir(exportDirs.exportsDir, { recursive:true }); await mkdir(exportOutside, { recursive:true }); await writeFile(join(exportOutside, 'report.json'), 'safe')
    await writeFile(join(exportDirs.photosDir, 'image.jpg'), 'source'); await symlink(exportOutside, join(exportDirs.exportsDir, 'keepers'), 'junction'); await symlink(join(exportOutside, 'report.json'), join(exportDirs.exportsDir, 'photofind-export-report.json'), 'file')
    const exportServer = await createServer({ config:{ ...exportDirs, host:'127.0.0.1', port:0, enableMetadataRepair:false } })
    try {
      const response = await exportServer.app.inject({ method:'POST', url:'/api/export', payload:{ mediaUris:['photofind://photos/image.jpg'], destinationUri:'photofind://exports' } })
      expect(response.statusCode).toBe(400); expect(await readFile(join(exportOutside, 'report.json'), 'utf8')).toBe('safe')
    } finally { await exportServer.close(); await rm(exportRoot, { recursive:true, force:true }) }
  })

  it.runIf(process.platform !== 'win32')('keeps pre-existing report and output symlinks untouched', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-http-export-links-'))
    const dirs = { configDir:join(root,'config'), cacheDir:join(root,'cache'), photosDir:join(root,'photos'), inboxDir:join(root,'inbox'), exportsDir:join(root,'exports') }
    const outside = join(root, 'outside'); const source = join(dirs.photosDir, 'image.jpg')
    await mkdir(dirs.photosDir, { recursive:true }); await mkdir(join(dirs.exportsDir, 'keepers'), { recursive:true }); await mkdir(outside, { recursive:true })
    await writeFile(source, 'source'); await writeFile(join(outside, 'image.jpg'), 'outside-output'); await writeFile(join(outside, 'report.json'), 'outside-report')
    await symlink(join(outside, 'image.jpg'), join(dirs.exportsDir, 'keepers', 'image.jpg'), 'file')
    await symlink(join(outside, 'report.json'), join(dirs.exportsDir, 'photofind-export-report.json'), 'file')
    const server = await createServer({ config:{ ...dirs, host:'127.0.0.1', port:0, enableMetadataRepair:false } })
    try {
      const response = await server.app.inject({ method:'POST', url:'/api/export', payload:{ mediaUris:['photofind://photos/image.jpg'], destinationUri:'photofind://exports' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().files[0].outputPath).toBe('photofind://exports/keepers/image-1.jpg')
      expect(response.json().reportPath).toBe('photofind://exports/photofind-export-report-1.json')
      expect(await readFile(join(outside, 'image.jpg'), 'utf8')).toBe('outside-output')
      expect(await readFile(join(outside, 'report.json'), 'utf8')).toBe('outside-report')
    } finally { await server.close(); await rm(root, { recursive:true, force:true }) }
  })
})
