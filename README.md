# PhotoFind Lite

PhotoFind is a hosted, browser-native photo finder and curation tool. The application is served centrally, but photo files and the working index stay on the computer using it.

The core idea is simple:

1. Open PhotoFind in a supported desktop browser.
2. Choose a local photo folder or an extracted Google Photos Takeout folder.
3. PhotoFind recursively indexes the collection in the browser.
4. Find useful photos using time, place, similarity and technical-quality signals.
5. Review with Keep, Maybe or Reject, compare related frames, and export self-contained copies safely.

The current Lite app can interpret local EXIF/Google Takeout metadata, filter and search by date/location/path/camera, browse geotagged photos on a map, open and zoom photos full-size, find exact duplicates/bursts/visually similar scenes, rank photos by explainable technical-quality signals, run focused review sessions, compare and pick the best related frame, persist review decisions, and export a standalone local selection.

The primary experience follows the visual and interaction rules in [PhotoFind visual design](docs/visual-design.md): photo-first, calm, task-based, progressively disclosed, keyboard accessible, and responsive down to narrow mobile-sized windows.

## Main modes

- **Library** — search, filter and browse the local collection.
- **Map** — find photos by geographic area.
- **Groups** — inspect duplicates, bursts and visually similar scenes.
- **Quality** — rank using explainable technical signals.
- **Review** — work through a focused Keep / Maybe / Reject session using buttons or keyboard shortcuts.
- **Compare** — inspect related frames together, select a winner and optionally reject the alternatives in one reversible action.
- **Selection** — inspect keepers and export the finished result.

## Browser folder access

PhotoFind uses progressive enhancement rather than checking browser brand:

- Browsers exposing `showDirectoryPicker()` get durable File System Access handles. PhotoFind can reopen the saved index and request folder permission again when necessary. These browsers can also export directly to a chosen writable folder.
- Other Chromium-style desktop browsers may fall back to a directory file picker (`webkitdirectory`). The index and review decisions still persist in IndexedDB, but the user must reselect the source folder after a refresh/browser restart before PhotoFind can preview, rescan or analyze the files. Direct folder export requires the File System Access API.

Fallback file objects are kept only in memory for the current browser session. PhotoFind does not duplicate an entire selected photo collection into IndexedDB merely to work around a missing durable directory handle.

## Privacy and media safety

- Photo bytes and Google Takeout sidecars are read directly by the browser from an explicitly selected local folder.
- PhotoFind does not upload originals, EXIF, GPS, filenames, paths, hashes, visual fingerprints, quality measurements, review decisions or the local index to its hosting server.
- Index metadata, review decisions and available persistent file/folder handles are stored locally in IndexedDB.
- Similarity and technical-quality analysis run in browser Web Workers. Derived hashes, perceptual fingerprints and scores are stored locally.
- Map tiles are requested from OpenStreetMap; those requests reveal the approximate map area being viewed to the tile provider, but do not contain PhotoFind photo records.
- Export writes only to a folder the user explicitly chooses. Source media are never modified or deleted.
- With **Embed repaired metadata** enabled, reliable normalized EXIF/Takeout date and GPS are embedded directly into exported JPEG copies.
- Formats that cannot be safely rewritten are copied unchanged and receive a neighbouring XMP sidecar.
- File-modification-time fallback is not written as a claimed capture date.
- Existing destination files are never overwritten. Filename collisions receive safe numbered suffixes.
- Optional JSON and HTML reports make an exported selection understandable without PhotoFind.
- Forgetting a PhotoFind index never deletes source photos.

Technical quality is deliberately separate from memory value. A low technical score is never a recommendation to delete a unique or meaningful photo.

## Review shortcuts

```text
K          Keep
M          Maybe
R          Reject
U          Reset to Unreviewed
← / →      Previous / next photo
Z          Cycle viewer zoom
Esc        Leave focused review/viewer mode
```

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

See [product](docs/product.md), [architecture](docs/architecture.md), [roadmap](docs/roadmap.md), and [visual design](docs/visual-design.md) for the current direction.
