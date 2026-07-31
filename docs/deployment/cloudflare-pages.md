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

The local-folder workflow currently targets desktop Chrome and Edge. The site must be served over HTTPS, which Cloudflare Pages provides by default.

Users explicitly choose a local directory through the File System Access API. The application then stores the directory handle and index metadata in IndexedDB on that browser profile.

The browser can require the user to grant folder permission again after a browser restart, permission reset or other security boundary. PhotoFind must treat reconnecting a folder as normal rather than as data loss.

## Privacy boundary

Do not add photo-upload endpoints to the static deployment.

The intended boundary is:

```text
Cloudflare Pages
  HTML / CSS / JavaScript only
           |
           v
User browser
  local directory handles
  local IndexedDB index
  local thumbnails / analysis
           |
           v
User photo folder
```

Future optional account or preference sync must remain separate from photo-original storage unless the product direction explicitly changes.
