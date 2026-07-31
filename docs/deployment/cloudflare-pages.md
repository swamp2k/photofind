# Cloudflare Pages deployment

PhotoFind Lite is a static Vite/React application. Cloudflare hosts only the application files; selected photos and the PhotoFind index remain on the user's computer.

## Recommended Git integration

Create a Cloudflare Pages project connected to `swamp2k/photofind`.

Use these build settings:

```text
Framework preset: React (Vite) or None
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
```

No server runtime, database, R2 bucket, D1 database or Pages Functions are required for the browser-native foundation.

Cloudflare's Git integration creates preview deployments for non-production branches and deploys the production branch automatically after pushes/merges.

## Browser requirements

PhotoFind detects local-folder capabilities at runtime rather than checking browser brand.

Preferred mode uses `showDirectoryPicker()` plus IndexedDB. Browsers exposing that API can persist directory/file handles and reconnect to an indexed folder after permission is granted again when necessary.

If `showDirectoryPicker()` is unavailable but directory file selection is available through `webkitdirectory`, PhotoFind uses reconnect mode instead. This covers browsers such as Brave that may deliberately disable the File System Access directory picker. The local index still persists, but source `File` objects exist only for the current browser session, so the user must reselect the folder after a refresh or restart before previews or rescans can access the source bytes.

PhotoFind intentionally does not store the fallback photo `File` blobs in IndexedDB, which would duplicate potentially very large photo archives inside browser storage.

The site must be served over HTTPS, which Cloudflare Pages provides by default.

## Privacy boundary

Do not add photo-upload endpoints to the static deployment.

The intended boundary is:

```text
Cloudflare Pages
  HTML / CSS / JavaScript only
           |
           v
User browser
  local directory/file selection
  local IndexedDB index
  local thumbnails / analysis
           |
           v
User photo folder
```

Future optional account or preference sync must remain separate from photo-original storage unless the product direction explicitly changes.
