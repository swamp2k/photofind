# PhotoFind architecture

## Current state

PhotoFind is an Electron + React/Vite + TypeScript prototype. It performs recursive
scanning, Google Takeout sidecar matching, explicit metadata repair, JPEG-compatible
thumbnail generation, SQLite keeper persistence, collision-safe export, and visible
diagnostics.

Milestone 0 separates that working logic into clear ownership boundaries:

```text
React feature components
        |
typed PhotoFindClient + separate native FolderPicker
        |
Electron renderer adapter (window.api)
        |
preload and Electron IPC adapter
        |
PhotoFindApplication use-case facade
        |
reusable media services + SQLite persistence/migrations
```

- `src/application/` owns reusable use-case orchestration.
- `src/services/` owns Electron-free scanning, matching, repair, thumbnail, and export
  logic.
- `src/persistence/` owns SQLite access, forward-only migrations, and the migration
  ledger.
- `src/main/` owns Electron lifecycle, native dialogs, IPC, and thumbnail protocol
  adaptation.
- `src/preload/` owns the context bridge.
- `src/renderer/` owns React UI and the typed renderer client adapter.
- `src/shared/` owns serialisable contracts shared by adapters and UI.

Dependencies point downward through those layers. Reusable application, service, and
persistence modules do not import Electron or call `app.getPath()`.

## Application and persistence boundaries

`PhotoFindApplication` receives the database and thumbnail-cache locations as
configuration. It orchestrates scans, scan persistence, keeper restoration, metadata
repair, keeper updates, export, and resource shutdown without knowing about IPC,
native dialogs, browser windows, or HTTP requests.

SQLite schema changes run through ordered transactions and are recorded in
`schema_migrations`. The baseline migration creates the prototype schema, safely
adopts a compatible database that predates the ledger, validates applied schema, and
does not recreate or delete existing media and keeper rows.

## Renderer and transport boundaries

Feature components depend on `PhotoFindClient`, not directly on `window.api`.
Native folder selection is intentionally a separate `FolderPicker` capability because
a browser upload or server-mounted source is not equivalent to an Electron dialog.
Milestone 1 can add an HTTP client beside the Electron client without rewriting the
feature components.

Shared results remain serialisable. Some compatibility contracts still contain
internal absolute paths because the prototype identifies media by path. A future HTTP
adapter must use scoped media identifiers or references and must not expose arbitrary
host filesystem paths by default.

## Thumbnail security

Reusable thumbnail generation returns a canonical internal cache path and leaves the
adapter-only `thumbnailUrl` presentation field empty. Persistence stores the canonical
path and no longer writes an Electron protocol URL as the source of truth. The
Electron adapter converts the path to `photofind-thumb://` only when returning a scan
to the renderer.

The custom protocol decodes only its own URL shape and serves files only when their
resolved path is inside the configured thumbnail cache. A future HTTP adapter can map
the same internal reference to a scoped HTTP route.

## Container-first future

The intended self-hosted deployment uses configurable mounts rather than hard-coded
paths:

```text
/config   database, configuration, and migration state
/cache    generated thumbnails, previews, and analysis data
/photos   permanent source libraries; read-only by default
/inbox    temporary Quick Sort input
/exports  completed exports and reports
```

A future backend HTTP adapter and persistent job runner will sit beside the Electron
adapters. Electron is transitional: it remains the working desktop shell during the
migration and can later wrap the same API and web interface. Milestone 0 does not add
the server, container files, uploads, background queue, or media intelligence.
