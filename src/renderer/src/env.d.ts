/// <reference types="vite/client" />

import type { PhotofindApi } from '../../preload'

declare global {
  interface Window {
    api: PhotofindApi
  }
}
