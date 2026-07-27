import { createServer } from './app'

let server: Awaited<ReturnType<typeof createServer>> | undefined
try {
  server = await createServer()
  await server.app.listen({ host: server.config.host, port: server.config.port })
  console.log(`PhotoFind listening on ${server.config.host}:${server.config.port}`)
} catch (error) {
  if (server) await server.close().catch(() => undefined)
  const code = error instanceof Error && /^(PHOTOS_SOURCE_NOT_DIRECTORY|STATIC_ROOT_UNAVAILABLE|CONFIGURATION_ROOT_OVERLAP|CONFIGURATION_UNAVAILABLE)$/.test(error.message) ? error.message : 'STARTUP_FAILED'
  console.error(`PhotoFind startup failed: ${code}`)
  process.exitCode = 1
}
const shutdown = async () => { try { if (server) await server.close(); process.exitCode = 0 } catch { process.exitCode = 1 } }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown)
