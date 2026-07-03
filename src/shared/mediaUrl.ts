const SCHEME_PREFIX = 'media://local/'

/** Renderer-side: turn an absolute filesystem path into a URL the `media://` protocol handler can serve. */
export function toMediaUrl(absolutePath: string): string {
  return `${SCHEME_PREFIX}${encodeURIComponent(absolutePath)}`
}

/** Main-side: recover the absolute filesystem path from a `media://` request URL. */
export function fromMediaUrl(url: string): string {
  return decodeURIComponent(url.slice(SCHEME_PREFIX.length))
}
