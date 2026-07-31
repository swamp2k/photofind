# PhotoFind Lite

PhotoFind is a hosted, browser-native photo finder and curation tool. The application is served centrally, but photo files and the working index stay on the computer using it.

The core idea is simple:

1. Open PhotoFind in desktop Chrome or Edge.
2. Choose a local photo folder or an extracted Google Photos Takeout folder.
3. PhotoFind recursively indexes the files in the browser.
4. Reopen the local index later without uploading the collection anywhere.
5. Use time, location, similarity and quality signals to find the photos worth keeping.

The current branch is the first browser-native foundation. It can select a local folder, build a persistent IndexedDB index, reopen that index, rescan it, show local image previews and keep unknown file types visible in Diagnostics.

## Privacy model

- Photo bytes are read directly by the browser from an explicitly selected local folder.
- PhotoFind does not upload originals to its hosting server.
- Folder handles, file handles and index metadata are stored locally in IndexedDB.
- Browser permission may need to be granted again after a restart or permission reset.
- Forgetting a PhotoFind index never deletes the source photos.

PhotoFind Lite currently targets desktop Chromium browsers because the File System Access API is central to the no-upload workflow.

## Development

Requires Node.js 20 or newer.

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
