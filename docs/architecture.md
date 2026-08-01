# PhotoFind architecture

## Active architecture

PhotoFind Lite is a static React/Vite application hosted centrally and executed entirely in the user's browser for its core photo workflow.

```text
Cloudflare Pages
  HTML / CSS / JavaScript / workers / face models
                  |
                  v
      User browser (Chromium desktop)
      +--------------------------------+
      | React UI                       |
      | browser media services         |
      | IndexedDB local index          |
      | Web Workers for hash/quality   |
      | opt-in local face analysis     |
      | deterministic event grouping   |
      +---------------+----------------+
                      |
           File System Access API
                      |
                      v
              Local photo folder
```

There is no required PhotoFind application server, user account, central photo database, photo upload step, face-recognition service or event-processing backend.

## Local folder access and provenance

Users explicitly choose folders through the File System Access API. PhotoFind requests read access for indexing and analysis.

Directory and file handles may be persisted through IndexedDB in supported Chromium browsers. A later visit can reopen the local index, but browser security policy may require a fresh permission confirmation before files are read again. PhotoFind treats this reconnect flow as normal.

The index stores paths relative to the selected root. A hosted browser application cannot reliably reveal an unavailable absolute path or open Explorer/Finder at an arbitrary file. PhotoFind therefore provides:

- parent-folder and full relative-path display;
- path copying;
- exact-parent-folder filtering in Library;
- source-folder summaries for groups, comparisons and events.

## Local index

IndexedDB is the authoritative persistence layer for the browser-native product.

Current database version: `2`.

Stores:

### `libraries`

- library identifier and display name;
- selected root directory handle where supported;
- access mode;
- timestamps and aggregate media counts.

### `media`

- file handles and relative paths;
- file type, size and modification time;
- normalized capture date/GPS and metadata provenance;
- Takeout sidecar relationships and diagnostics;
- hashes and perceptual fingerprints;
- explainable technical-quality measurements;
- review decisions;
- versioned face-analysis status, normalized face boxes, local embeddings and person assignments.

### `people`

- library-scoped person identifier;
- optional user-supplied name;
- ignored/restored state;
- face references;
- local centroid used to preserve corrected identities through re-clustering;
- creation/update timestamps.

People records and media assignments are updated atomically. Forgetting a library removes its people rows as well as library/media rows, but never touches source files.

Large reusable previews or future binary caches should move to OPFS or another browser-appropriate cache rather than bloating index rows. Face crops are rendered on demand from source photos and are not persisted as separate images.

## Browser media pipeline

```text
Directory enumeration
        |
        v
Basic file index
        |
        +--> EXIF / Takeout sidecar metadata
        +--> dates / GPS
        +--> browser previews
        +--> exact hashes / duplicate groups       [worker]
        +--> perceptual similarity                 [worker]
        +--> technical quality                     [worker]
        +--> opt-in face boxes / embeddings        [dynamic local model]
        +--> people clustering / corrections       [pure local domain logic]
        +--> deterministic event grouping          [pure local domain logic]
```

Similarity and quality analysis already run in dedicated Web Workers. People analysis dynamically imports its optional ML dependency and yields between photos while preserving reusable per-photo results. It should move to a worker or equivalent background execution when real-library profiling shows UI interaction is materially affected.

## People analysis

People analysis is explicit and opt-in.

PhotoFind uses `@vladmandic/human` with only the face detector and face-description embedding enabled. The production build copies only the required detector/descriptor model JSON and weights into `dist/models/`. The Human JavaScript bundle is dynamically imported only after People analysis begins.

Disabled/out of scope:

- age;
- gender;
- race/ethnicity;
- emotion;
- real-world identity lookup;
- automatic naming.

The result of analysis is local face geometry plus an embedding. Clustering is assistive and reversible through rename, merge, split, ignore and restore operations. No photo bytes or embeddings are sent to the host.

## Events

Events are derived at runtime from the local media index. They are not a new source-folder structure and currently do not need their own persistence store.

Grouping starts with capture-time ordering and uses conservative thresholds:

- very close timestamps continue an event directly;
- moderate gaps require supporting evidence;
- large gaps split events.

Supporting evidence can include:

- exact source-folder continuity;
- nearby GPS;
- shared known people;
- shared similarity group.

Event IDs are stable for the same ordered item set. Event titles are generated from dates and dominant folder context. Review decisions remain on media rows and are not changed by event generation.

## Google Takeout and export

Takeout media and JSON/XMP sidecars are merged logically in the local index.

The browser-native product does not rewrite originals merely to make Takeout useful. Repaired/combined metadata is used internally. Explicit export can embed reliable date/GPS into newly exported JPEG copies or write XMP sidecars for formats that cannot be safely rewritten.

## Static hosting

The production build is fully static and emitted to `dist/`.

Cloudflare Pages builds with:

```text
npm run build
```

and publishes:

```text
dist
```

The host stores application assets and the required static face model files only. Core photo operations do not require Pages Functions, Workers, D1, R2, or another PhotoFind backend.

## Privacy boundary

Do not introduce photo uploads merely because the UI is hosted remotely.

The browser may make ordinary network requests for application updates, same-origin model assets and external map tiles. Photo originals, extracted metadata, GPS coordinates, relative paths, hashes, technical measurements, face embeddings, people labels, events, local index rows and review decisions remain local unless the user explicitly opts into a later sync feature.

Map providers deserve special treatment: requesting map tiles naturally reveals the viewed geographic region to the tile provider even though indexed coordinates remain local.

## Previous architecture

The Electron, HTTP-server, SQLite, and Docker/Unraid implementation is preserved on:

```text
archive/container-milestone-1
```

It may become useful again for an optional home-server edition, but it is not the active architecture and must not constrain browser-native implementation decisions.
