import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); this.name = 'ApiError' }
}

function clientPathError(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException)?.code
  const message = error instanceof Error ? error.message : ''
  if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EINVAL', 'EILSEQ'].includes(code ?? '')) return 'PATH_NOT_FOUND'
  if (/Malformed (?:PhotoFind URI|percent encoding)|Invalid scoped path|Absolute paths are not allowed|Unknown PhotoFind root|PATH_OUTSIDE_ROOT|Invalid scoped path segment/i.test(message)) return 'INVALID_PATH'
  return undefined
}

export function sendError(reply: FastifyReply, error: unknown, requestId = 'unknown'): FastifyReply {
  if (error instanceof ApiError) {
    reply.log.warn({ errorCode: error.code, requestId }, 'PhotoFind API request failed')
    return reply.code(error.status).send({ error: { code: error.code, message: error.message, requestId } })
  }
  const fastifyError = error as FastifyError
  if (fastifyError?.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
    reply.log.warn({ errorCode: 'INVALID_JSON', requestId }, 'PhotoFind API request failed')
    return reply.code(400).send({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON', requestId } })
  }
  if (error instanceof Error && error.message === 'PATH_OUTSIDE_ROOT') {
    reply.log.warn({ errorCode: 'PATH_OUTSIDE_ROOT', requestId }, 'PhotoFind API request failed')
    return reply.code(400).send({ error: { code: 'PATH_OUTSIDE_ROOT', message: 'The selected path is outside an allowed PhotoFind root.', requestId } })
  }
  const pathCode = clientPathError(error)
  if (pathCode) {
    reply.log.warn({ errorCode: pathCode, requestId }, 'PhotoFind API request failed')
    return reply.code(400).send({ error: { code: pathCode, message: pathCode === 'PATH_NOT_FOUND' ? 'The selected path could not be found.' : 'The selected path is invalid.', requestId } })
  }
  reply.log.error({ errorCode: 'INTERNAL_ERROR', requestId }, 'PhotoFind API request failed')
  return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Request failed', requestId } })
}

export function registerErrorHandling(app: { setErrorHandler: (handler: (error: unknown, request: FastifyRequest, reply: FastifyReply) => FastifyReply) => void }): void {
  app.setErrorHandler((error, request, reply) => sendError(reply, error, request.id))
}
