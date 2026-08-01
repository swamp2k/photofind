# Lite 6–7 handover — source provenance, people and events

## Goal

Make every photo traceable to its source folder, then add useful browser-local people and event intelligence without weakening PhotoFind's local-first privacy model.

## Product decisions

### Source provenance

A browser application cannot reliably open Windows Explorer/Finder at an arbitrary local path. PhotoFind therefore provides the useful browser-safe equivalent:

- show the parent folder and full relative path in individual-photo inspectors;
- copy the relative path;
- filter the Library to every photo from the same source folder;
- summarize every source folder represented by duplicate/burst/similarity groups;
- show per-candidate folder provenance in Compare.

Paths are always relative to the explicitly selected library root. PhotoFind must never imply that it knows an unavailable absolute filesystem path.

### Lite 6 — People

People analysis is explicit and opt-in.

- Face detection and face-description embeddings run in the browser.
- Model files are static PhotoFind assets served from the same origin.
- Photo pixels and biometric embeddings are never uploaded.
- Only face boxes, local embeddings, cluster assignments and user labels are persisted in IndexedDB.
- No age, gender, race or emotion inference is enabled.
- Clusters are suggestions and must support rename, merge, split and ignore.
- False matches must remain reversible.
- Reanalysis should preserve named people where centroid matching is sufficiently confident.
- Face-specific technical quality is not used to discard photos.

### Lite 7 — Events

Events are derived local index data.

- Hard time gaps separate events.
- Nearby timestamps may remain together when supported by shared location, source folder, similarity group or known people.
- Events expose the evidence used to group them.
- Event grouping never changes source files or review decisions.
- Natural-language search remains a later milestone.

## Architecture

### Static face models

Use `@vladmandic/human` with only:

- face detector;
- face description/embedding.

The production build copies only the required detector and descriptor model files into `dist/models/`. The Human bundle is dynamically imported when People analysis starts so the normal Library path does not pay the full initial JavaScript cost.

### IndexedDB schema

Upgrade the database without replacing existing stores.

Existing:

- `libraries`
- `media`

Add:

- `people`, indexed by `libraryId`

Media rows gain versioned face-analysis fields and face observations. Person records hold labels, ignored state, face references and a centroid used to preserve identity across re-clustering.

### Event grouping

Events are derived from media, people assignments and similarity groups in pure deterministic TypeScript. They are not a destructive reorganization of the library.

## Acceptance

### Source provenance

- Open an individual photo from Library, Map, Groups, Quality, Review, Compare and Selection.
- Confirm the parent folder and full relative path are visible.
- Copy the relative path.
- Choose “Show folder in Library” and confirm only that exact parent folder is shown.
- Open an exact-duplicate group spanning multiple folders.
- Confirm the group lists each contributing folder and count.
- Confirm Compare shows a folder for each candidate.

### People

Use a disposable folder containing repeated faces plus unrelated people.

- Start People analysis explicitly.
- Confirm model loading and per-photo progress are visible.
- Confirm the normal app does not load face models before analysis starts.
- Confirm clusters are created locally.
- Rename a person, refresh and reopen the index; confirm the name persists.
- Merge two clusters and confirm all face references move atomically.
- Split one face into a new person and confirm both records persist.
- Ignore and restore a person.
- Rescan unchanged source media and confirm face analysis/person assignments survive.
- Run analysis again and confirm named clusters are preserved when confidently matched.
- Confirm no age/gender/race/emotion result is produced or stored.
- Inspect Network: no photo bytes or embeddings leave the browser.

### Events

- Build events from a folder with multiple days/locations/folders.
- Confirm large time gaps split events.
- Confirm close photos with common location/folder/person/similarity evidence can remain together.
- Confirm event cards show date range, photo count, people and source-folder context.
- Open an event and browse/review its photos.
- Confirm event generation does not change review decisions.

### Regression and safety

- Existing timeline, map, similarity, quality, review, compare, selection and export flows still work.
- Rescanning preserves review, similarity, quality and face state for unchanged files.
- Forgetting a library removes its people records but never touches source media.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes and `dist/models/` contains only required face model assets.

## Known limitations accepted for this milestone

- Face clustering is assistive and can produce false joins/splits.
- Very large libraries may require long-running analysis; progress and reuse must remain visible.
- Browser security prevents opening the operating-system file manager at a relative path.
- Event titles are generated, not natural-language authored.
- Cross-device people/event sync is out of scope.
