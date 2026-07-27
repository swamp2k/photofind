import Fastify, { type FastifyReply } from 'fastify'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PhotoFindApplication } from '../application/PhotoFindApplication'
import { parseServerConfig, prepareServerConfig, type ServerConfig } from './config'
import { registerRoutes } from './http/routes'
import { registerErrorHandling } from './http/errors'
import { RootPolicy } from './paths/rootPolicy'
import packageJson from '../../package.json'

export interface PhotoFindServer {
  app: ReturnType<typeof Fastify>
  config: ServerConfig
  application: PhotoFindApplication
  close: () => Promise<void>
}

const activeDatabasePaths = new Set<string>()

export async function createServer(options: { config?: ServerConfig } = {}): Promise<PhotoFindServer> {
  const config = options.config ?? parseServerConfig()
  config.version ??= packageJson.version
  await prepareServerConfig(config)

  const policy = new RootPolicy({
    photos: config.photosDir,
    inbox: config.inboxDir,
    exports: config.exportsDir
  })
  const databasePath = resolve(await realpath(config.configDir), 'photofind.sqlite')
  if (activeDatabasePaths.has(databasePath)) throw new Error('DATABASE_IN_USE')
  activeDatabasePaths.add(databasePath)
  let application: PhotoFindApplication
  try {
    application = new PhotoFindApplication({ databasePath, thumbnailCacheRoot: config.cacheDir })
  } catch (error) {
    activeDatabasePaths.delete(databasePath)
    throw error
  }
  const app = Fastify({ logger: { level: 'info' } })
  const readiness = { ready: false }
  let appClosed = false
  let applicationClosed = false
  const cleanup = async () => {
    if (!appClosed) {
      appClosed = true
      try { await app.close() } catch { /* continue closing application */ }
    }
    if (!applicationClosed) {
      applicationClosed = true
      application.close()
      activeDatabasePaths.delete(databasePath)
    }
  }
  try {
    registerErrorHandling(app)
    app.addHook('onSend', async (_request, reply) => {
    reply
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'")
    })
    await registerRoutes(app, application, policy, config, readiness)

  const notFound = (request: { url: string; id: string }, reply: FastifyReply): FastifyReply =>
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: request.id
      }
    })

    if (config.staticDir) {
      const { default: fastifyStatic } = await import('@fastify/static')
      await app.register(fastifyStatic, { root: config.staticDir, wildcard: false })
      app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? notFound(request, reply) : reply.sendFile('index.html'))
    } else {
      app.setNotFoundHandler(notFound)
    }
    readiness.ready = true
  } catch (error) { await cleanup(); throw error }

  return {
    app,
    config,
    application,
    close: cleanup
  }
}
