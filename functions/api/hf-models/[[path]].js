const MODEL_OWNER = 'Xenova'
const MODEL_NAME = 'siglip-base-patch16-224'
const MODEL_REVISION = 'main'

export async function onRequest(context) {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const rawParts = context.params.path
  const parts = Array.isArray(rawParts) ? rawParts : typeof rawParts === 'string' ? [rawParts] : []
  if (!isAllowedModelPath(parts)) return new Response('Model asset not found', { status: 404 })

  const upstreamPath = parts.map((part) => encodeURIComponent(part)).join('/')
  const upstreamUrl = `https://huggingface.co/${upstreamPath}`
  const requestHeaders = new Headers({ Accept: context.request.headers.get('Accept') || '*/*' })
  copyRequestHeader(context.request.headers, requestHeaders, 'Range')
  copyRequestHeader(context.request.headers, requestHeaders, 'If-None-Match')
  copyRequestHeader(context.request.headers, requestHeaders, 'If-Modified-Since')

  let upstream
  try {
    upstream = await fetch(upstreamUrl, {
      method: context.request.method,
      headers: requestHeaders,
      redirect: 'follow',
      cf: { cacheEverything: true, cacheTtl: 604800 }
    })
  } catch (error) {
    return Response.json({
      error: 'Semantic model provider could not be reached.',
      detail: error instanceof Error ? error.message : 'upstream fetch failed'
    }, { status: 502 })
  }

  const headers = new Headers()
  copyResponseHeader(upstream.headers, headers, 'Content-Type')
  copyResponseHeader(upstream.headers, headers, 'ETag')
  copyResponseHeader(upstream.headers, headers, 'Last-Modified')
  copyResponseHeader(upstream.headers, headers, 'Accept-Ranges')
  copyResponseHeader(upstream.headers, headers, 'Content-Range')
  headers.set('Cache-Control', upstream.ok ? 'public, max-age=604800, s-maxage=604800' : 'no-store')
  headers.set('X-PhotoFind-Model-Gateway', 'huggingface')

  return new Response(context.request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  })
}

function isAllowedModelPath(parts) {
  if (parts.length < 5) return false
  if (parts[0] !== MODEL_OWNER || parts[1] !== MODEL_NAME || parts[2] !== 'resolve' || parts[3] !== MODEL_REVISION) return false
  return parts.slice(4).every((part) => typeof part === 'string' && part.length > 0 && part !== '.' && part !== '..' && !part.includes('\\'))
}

function copyRequestHeader(source, target, name) {
  const value = source.get(name)
  if (value) target.set(name, value)
}

function copyResponseHeader(source, target, name) {
  const value = source.get(name)
  if (value) target.set(name, value)
}
