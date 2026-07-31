# PhotoFind architecture

## Active architecture

PhotoFind Lite is a static React/Vite application hosted centrally and executed entirely in the user's browser for its core photo workflow.

```text
Cloudflare Pages
  HTML / CSS / JavaScript / WASM/models
                  |
                  v
        User browser (Chrome/Edge)
        +-------------------------+
        | React UI                |
        | browser media services  |
        | IndexedDB local index   |
        | future OPFS cache       |
        +------------+------------+
                     |
          File System Access API
                     |
                     v
             Local photo folder
```

There is no required PhotoFind application server, user account, central photo database, or upload step.

## Local folder access

Users explicitly choose folders through the File System Access API. PhotoFind requests read access for indexing and analysis.

Directory and file handles may be persisted through IndexedDB in supported Chromium browsers. A later visit can reopen the local index, but browser security policy may require a fresh permission confirmation before files are read again.

PhotoFind must treat this reconnect flow as normal.

## Local index

IndexedDB is the authoritative persistence layer for the browser-native product.

The first browser foundation stores:

- a library identifier and display name;
- the selected root directory handle;
- file handles;
- relative paths;
- file type classification;
- size and modification time;
- aggregate media counts.

Later migrations will extend the local schema with normalized capture metadata, GPS, Takeout sidecar relationships, hashes, embeddings, quality measurements, review decisions, and derived groups.

Large binary analysis artifacts and reusable previews should move to OPFS or another browser-appropriate cache rather than bloating index rows.

## Browser media pipeline

The browser-native media pipeline should evolve in layers:

```text
Directory enumeration
        |
        v
Basic file index
        |
        +--> EXIF / sidecar metadata
        +--> dates / GPS
        +--> browser previews
        +--> hashes / duplicate groups
        +--> similarity features
        +--> quality analysis
        +--> face/event signals later
```

Expensive work must be moved off the UI thread using Web Workers as those milestones arrive. WebGPU/WASM may be used for local ML when justified.

## Google Takeout

Takeout media and JSON/XMP sidecars should be merged logically in the local index.

The browser-native product does not need to rewrite originals merely to make Takeout useful. It can use repaired/combined metadata internally and reserve physical metadata writes for an explicit later export/normalisation workflow.

## Static hosting

The production build is fully static and emitted to `dist/`.

Cloudflare Pages is the intended host. Git integration should build with:

```text
npm run build
```

and publish:

```text
dist
```

The host stores application assets only. Core photo operations must not require Pages Functions, Workers, D1, R2, or another PhotoFind backend.

## Privacy boundary

Do not introduce photo uploads merely because the UI is hosted remotely.

The browser may make ordinary network requests for application updates and external map tiles. Photo originals, extracted metadata, GPS coordinates, local index rows, review decisions, and future embeddings remain local unless the user explicitly opts into a later sync feature.

Map providers deserve special treatment: requesting map tiles naturally reveals the viewed geographic region to the tile provider even though indexed coordinates remain local.

## Previous architecture

The Electron, HTTP-server, SQLite, and Docker/Unraid implementation is preserved on:

```text
archive/container-milestone-1
```

It may become useful again for an optional home-server edition, but it is not the active architecture and must not constrain browser-native implementation decisions.
