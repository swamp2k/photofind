# Lite 0 Handover — Browser Foundation

**Status:** implementation in progress on `agent/photofind-lite-browser-foundation`

## Objective

Prove the new PhotoFind Lite architecture end to end:

- centrally hosted static application;
- local folder selection in desktop Chrome/Edge;
- no photo upload/backend dependency;
- persistent local index;
- local previews after reconnecting a previously indexed folder;
- Cloudflare Pages-compatible production build.

## Included

- React/Vite static application.
- File System Access API directory picker in read mode.
- Recursive file enumeration.
- Classification of images, RAW, video, sidecars, and unknown files.
- IndexedDB library store containing directory/file handles and basic metadata.
- Reopen and rescan an indexed folder.
- Local image previews from file handles via temporary blob URLs.
- Progressive grid rendering rather than rendering an entire large library at once.
- Visible unknown-file Diagnostics.
- Forget-index action that never touches source files.
- Cloudflare Pages build/deployment documentation.

## Explicitly not included

- EXIF parsing.
- Google Takeout sidecar matching.
- timeline UI.
- map/GPS UI.
- duplicate/similarity analysis.
- quality scoring.
- Keep/Maybe/Reject.
- export.
- accounts/sync/multiuser.
- backend/server/container support on the active branch.

Those belong to later Lite milestones.

## Acceptance

### Automated

```bash
npm install
npm run typecheck
npm test
npm run build
```

The production artifact must be static under `dist/` and must not depend on Electron, Fastify, SQLite native modules, or a PhotoFind HTTP API.

### Browser smoke — Chrome or Edge desktop

1. Open the application over localhost or HTTPS.
2. Choose a disposable directory containing at least:
   - ordinary JPG/PNG photos;
   - a nested subfolder;
   - one video;
   - one JSON sidecar;
   - one unknown file.
3. Confirm recursive counts are correct.
4. Confirm image previews render from local files.
5. Confirm the unknown file appears in Diagnostics.
6. Refresh the page.
7. Confirm the indexed library is still listed.
8. Click it and grant read permission again if the browser asks.
9. Confirm its indexed media and previews can be reopened.
10. Add/remove a disposable source file, use Rescan, and confirm counts change.
11. Use Forget index and confirm:
    - the PhotoFind library disappears;
    - every source file remains untouched.

### Privacy/network acceptance

Using browser DevTools Network during scan and browsing:

- application asset requests are expected;
- no selected photo bytes, file metadata, paths, or index records may be POSTed/uploaded anywhere;
- there must be no dependency on `/api/*` routes for the core Lite 0 flow.

### Cloudflare Pages preview

Connect the repository to Cloudflare Pages or create a preview deployment with:

```text
Build command: npm run build
Output directory: dist
```

Open the HTTPS preview in Chrome/Edge and repeat folder selection + local preview checks.

## Known browser constraint

The File System Access API and durable handle behaviour are the reason Lite 0 targets desktop Chromium first. Requiring a new permission click after browser restart is acceptable; losing the saved local index is not.
