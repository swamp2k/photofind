# PhotoFind Lite

PhotoFind is a hosted, browser-native photo finder and curation tool. The application is served centrally, but photo files and the working index stay on the computer using it.

The core idea is simple:

1. Open PhotoFind in a supported desktop browser.
2. Choose a local photo folder or an extracted Google Photos Takeout folder.
3. PhotoFind recursively indexes the collection in the browser.
4. Reopen the local index later without uploading the collection anywhere.
5. Use time, location, similarity and technical-quality signals to find the photos worth keeping.

The current Lite app can interpret local EXIF/Google Takeout metadata, filter by date and location, browse geotagged photos on a map, open photos full-size, find exact duplicates/bursts/visually similar scenes, and rank photos by explainable technical-quality signals.

## Browser folder access

PhotoFind uses progressive enhancement rather than checking browser brand:

- Browsers exposing `showDirectoryPicker()` get durable File System Access handles. PhotoFind can reopen the saved index and request folder permission again when necessary.
- Other Chromium-style desktop browsers may fall back to a directory file picker (`webkitdirectory`). The index still persists in IndexedDB, but the user must reselect the source folder after a refresh/browser restart before PhotoFind can preview, rescan or analyze the files.

Fallback file objects are kept only in memory for the current browser session. PhotoFind does not duplicate an entire selected photo collection into IndexedDB merely to work around a missing durable directory handle.

## Privacy model

- Photo bytes and Google Takeout sidecars are read directly by the browser from an explicitly selected local folder.
- PhotoFind does not upload originals, EXIF, GPS, filenames, paths, hashes, visual fingerprints, quality measurements or the local index to its hosting server.
- Index metadata and available persistent file/folder handles are stored locally in IndexedDB.
- Similarity and technical-quality analysis run in browser Web Workers. Derived hashes, perceptual fingerprints and scores are stored locally.
- Map tiles are requested from OpenStreetMap; those requests reveal the approximate map area being viewed to the tile provider, but do not contain PhotoFind photo records.
- Reconnect-mode browsers require the source folder to be selected again after a refresh or browser restart.
- Forgetting a PhotoFind index never deletes the source photos.

Technical quality is deliberately separate from memory value. A low technical score is never a recommendation to delete a unique or meaningful photo.

## Development

Requires Node.js 22.12.x.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The production build is emitted to `dist/` and is fully static.

## Cloudflare Pages

PhotoFind Lite is intended to be deployed directly from this GitHub repository with Cloudflare Pages.

Use:

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
```

See [Cloudflare Pages deployment](docs/deployment/cloudflare-pages.md).

## Previous server/container implementation

The completed Electron/server/container foundation has been frozen on:

```text
archive/container-milestone-1
```

It remains available if PhotoFind later needs a home-server edition. The active product direction is browser-native PhotoFind Lite.

See [product](docs/product.md), [architecture](docs/architecture.md), and [roadmap](docs/roadmap.md) for the current direction.
