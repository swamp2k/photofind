# Milestone 0 Handover — Product and Architecture Reset

**Project:** PhotoFind  
**Milestone:** 0  
**Status:** Ready for implementation  
**Primary outcome:** Reframe the existing Electron prototype around the curation-first product and establish reusable application, persistence and transport boundaries for later container/web work.

## 1. Objective

Prepare the existing repository for the planned PhotoFind roadmap without prematurely implementing the web server, container deployment or Quick Sort intelligence.

At the end of this milestone:

- The repository clearly describes PhotoFind as a photo-curation product with two first-class workflows: **Quick Sort** and **Library**.
- Google Takeout repair is retained as an optional ingestion feature rather than the product centre.
- Reusable application and media-processing code is no longer structurally owned by Electron IPC.
- The React renderer accesses PhotoFind through one transport-neutral client boundary rather than calling `window.api` throughout feature components.
- SQLite schema changes use explicit, tested migrations.
- Existing Electron functionality still works.
- The repository is ready for Milestone 1 to add an HTTP adapter and container packaging without rewriting the domain logic again.

## 2. Read before implementation

The supervisor and worker must read:

- `AGENTS.md`
- `README.md`
- `package.json`
- `src/shared/types.ts`
- `src/main/index.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/main/services/`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/ImportView.tsx`
- Existing tests under `src/main/services/`

Inspect the complete repository and `git status` before editing. Preserve unrelated work.

## 3. Current repository state

The current prototype provides real working functionality:

- Electron + React/Vite + TypeScript application.
- Recursive media scanning and file classification.
- Google Takeout JSON sidecar matching.
- Safe/uncertain/missing match states.
- Explicit metadata dry-run and repair through ExifTool.
- JPEG-compatible thumbnail generation through Sharp.
- Custom Electron thumbnail protocol.
- Basic thumbnail grid and diagnostics drawer.
- SQLite persistence of scanned media and keeper marks.
- Basic flat-folder keeper export with a JSON report.
- Unit tests for matching, thumbnails, persistence and export.

Important current coupling:

- Reusable services live under `src/main/services`, implying Electron ownership even when they do not depend on Electron.
- `src/main/ipc.ts` creates the database and orchestrates application behaviour directly.
- The renderer calls `window.api` directly from feature components.
- Shared result types mix domain information, internal filesystem paths and renderer transport details such as thumbnail URLs.
- `LibraryStore.initialize()` creates tables directly and has no migration ledger.

Do not discard working logic merely because its current location is imperfect.

## 4. Product decisions that are fixed for this milestone

### 4.1 First-class workflows

PhotoFind has two equal product workflows.

#### Quick Sort

A temporary batch-processing workflow:

1. Supply a folder or upload a batch.
2. Generate previews and analysis.
3. Group exact duplicates, bursts and near-identical images.
4. Recommend technically stronger candidates with explanations.
5. Review using `Keep`, `Maybe`, `Reject` and `Unreviewed`.
6. Export the chosen originals.
7. Optionally remove the temporary job and generated cache.

#### Library

A long-lived archive workflow:

1. Index source folders without moving originals.
2. Browse and review the archive over time.
3. Use timeline, similarity, people, places and events as they become available.
4. Support optional shared household review.
5. Export a standalone curated archive.

Milestone 0 documents these workflows but does not implement their later features.

### 4.2 Review decisions

The canonical future decision states are:

```text
unreviewed
keep
maybe
reject
```

Current keeper behaviour may remain operational during this milestone. Do not implement the complete review-decision UI or shared-review schema yet unless a minimal compatibility type is needed to establish the architecture.

### 4.3 Solo and shared review

Solo mode remains the simple default.

Future shared review stores each user’s decision separately from the final collection decision. One reviewer must never overwrite another reviewer’s opinion.

Do not implement authentication or multiuser screens in Milestone 0.

### 4.4 Media safety

- Original media is irreplaceable.
- Source libraries are read-only by default in the future container deployment.
- Metadata writes remain an explicitly enabled Repair Mode operation.
- No silent overwrite, deletion, rejection or unsupported-file handling.
- Export output must remain independent of PhotoFind.

## 5. Target architecture after this milestone

Use simple boundaries appropriate to the current repository. Do not introduce a framework-heavy architecture.

The exact filenames may differ when justified, but the dependency direction must be equivalent to:

```text
React feature components
        ↓
renderer PhotoFind client interface
        ↓
current Electron client adapter
        ↓
Electron preload / IPC adapter
        ↓
application service / use-case facade
        ↓
reusable media services + persistence
```

Milestone 1 will add an HTTP client and HTTP server adapter beside the Electron adapter.

### 5.1 Expected source responsibilities

A reasonable target layout is:

```text
src/
  application/       # Use-case facade and application-level orchestration
  services/          # Reusable scanning, matching, repair, thumbnail and export logic
  persistence/       # SQLite store, migration runner and migration definitions
  shared/            # Serializable contracts and shared domain types
  main/              # Electron-only window, dialogs, protocols and IPC adapter
  preload/           # Electron context bridge
  renderer/          # React UI and renderer client adapter
```

Equivalent naming is acceptable when the separation remains obvious.

Do not force pure domain logic, filesystem infrastructure and application use-cases into a complex DDD hierarchy. This milestone needs clear ownership, not abstraction for its own sake.

### 5.2 Electron boundary

Imports from `electron` must be confined to Electron adapter areas such as:

- `src/main/`
- `src/preload/`

Reusable scanning, matching, persistence, export and application-use-case modules must not import Electron.

### 5.3 Application facade

Introduce one reusable application-level facade or equivalent set of use-case services. It must own the orchestration currently embedded in IPC registration, including at least:

- Running a scan with configured thumbnail storage.
- Persisting scan results.
- Restoring current keeper state.
- Running metadata repair.
- Updating current keeper state.
- Exporting selected media.
- Closing owned persistent resources cleanly.

The application facade must not:

- Open native dialogs.
- Know about `BrowserWindow`, IPC channels or Electron lifecycle.
- Return Electron-only URLs as canonical stored data.
- Assume future HTTP request objects.

The Electron IPC adapter should translate IPC requests to facade calls and native folder-selection dialogs.

### 5.4 Renderer client boundary

Create one typed renderer-facing client interface, for example `PhotoFindClient`.

Feature components must call this client rather than `window.api` directly.

The current Electron implementation may wrap the preload API. Milestone 1 must be able to add an HTTP implementation without rewriting feature components.

Keep native folder-picker methods clearly separated from portable application operations. Browser upload and server-mounted source selection are later concerns and must not be faked in this milestone.

### 5.5 Thumbnail transport boundary

Cached thumbnail identity and storage must not be permanently coupled to the Electron custom protocol.

Required direction:

- Canonical persistence stores a thumbnail path, key or stable reference.
- The Electron adapter may convert that reference into a `photofind-thumb://` URL.
- A future HTTP adapter must be able to convert the same reference into an HTTP URL.
- Do not persist an Electron URL as the source of truth for future retrieval.

Maintain current thumbnail display behaviour in Electron.

### 5.6 Public versus internal paths

Absolute filesystem paths are currently part of shared result types. Milestone 0 does not need to replace all path-based identity with database IDs, but it must document and establish this rule:

- Internal application and persistence code may use validated absolute paths.
- Future HTTP responses must not expose arbitrary host filesystem paths by default.
- New transport contracts should prefer media IDs or scoped references where practical.

Avoid a disruptive full identity migration in this milestone unless it is required to achieve the application boundary safely.

## 6. Required implementation work

### 6.1 Product and roadmap documentation

Create or update documentation so the repository has one unambiguous direction.

Required documents:

- `README.md`
  - Concise project introduction.
  - Honest current status.
  - Quick Sort and Library overview.
  - Current development commands.
  - Links to deeper product and architecture documentation.
- `docs/product.md`
  - Product purpose.
  - Quick Sort workflow.
  - Library workflow.
  - Solo and optional shared review principles.
  - Technical-best versus memory-keeper distinction.
  - Diagnostics and media-safety principles.
- `docs/architecture.md`
  - Current state.
  - Target boundaries.
  - Dependency direction.
  - Container-first future shape.
  - Expected future mounts: `/config`, `/cache`, `/photos`, `/inbox`, `/exports`.
  - Electron’s transitional role.
  - Thumbnail and path-security boundaries.
- `docs/roadmap.md`
  - Milestones 0–11 and release groupings.
  - Keep descriptions compact but consistent with the agreed roadmap.

Do not leave conflicting older roadmap text in `README.md`.

### 6.2 Extract reusable code from Electron ownership

Move or reorganise reusable modules currently located in `src/main/services/` so their paths reflect that they are usable by Electron and a future server.

Likely reusable modules include:

- File classification.
- Recursive scanning.
- Takeout sidecar matching.
- Scan orchestration.
- Metadata repair.
- Thumbnail generation.
- Keeper export.
- SQLite library persistence.

Electron-specific modules should remain under `src/main`, including:

- Native dialogs.
- IPC registration.
- Browser-window lifecycle.
- Custom protocol registration and URL translation.

Preserve unit-test coverage when files move. Avoid unnecessary rewrites of working algorithms.

### 6.3 Add application orchestration boundary

Implement the application facade described in section 5.3.

Construct it using explicit configuration or injected dependencies for at least:

- Database location.
- Thumbnail cache location.

Do not call `app.getPath()` from reusable application or persistence modules. Electron resolves its locations and passes them in.

Ensure persistent resources are closed during application shutdown.

### 6.4 Add renderer client abstraction

- Define a typed client interface shared by renderer features.
- Provide an Electron-backed implementation.
- Inject or provide the client to feature components through a small, understandable mechanism.
- Remove direct `window.api` usage from feature components such as `ImportView`.
- Keep `window.api` confined to the Electron client adapter and typing declarations.

Do not introduce Redux, a dependency-injection framework or a large state-management rewrite.

### 6.5 Add explicit SQLite migrations

Replace direct schema creation as the long-term schema-management mechanism.

Use the existing `better-sqlite3` dependency. Do not add an ORM or migration package unless there is a demonstrated need and the supervisor approves it.

Required migration behaviour:

- Create a migration ledger such as `schema_migrations`.
- Apply migrations exactly once and in a deterministic order.
- Run migrations transactionally where SQLite permits.
- Fail clearly on an invalid or partially applied migration.
- Support a fresh database.
- Safely adopt an existing prototype database containing `media_items` and `keepers` but no migration ledger.
- Preserve existing media and keeper rows.
- Make the current schema the first recorded baseline migration.

Required tests:

1. Fresh database receives the full current schema and migration record.
2. Reopening an up-to-date database does not reapply migrations.
3. Existing prototype database is adopted without deleting rows.
4. A failed migration does not report success or advance the migration ledger.

Keep migrations forward-only for now. Rollback tooling is not required.

### 6.6 Update shared contracts carefully

Refactor shared types only where needed for the new boundaries.

Requirements:

- Preserve serialisability for future HTTP transport.
- Avoid storing adapter-specific URLs as canonical domain state.
- Keep diagnostic entries explicit.
- Do not implement the full future multiuser model.
- Do not silently change current user-visible behaviour.

Where temporary compatibility fields are necessary, document them and keep conversion at adapter boundaries.

### 6.7 Update tests and imports

- Move tests with their reusable modules or update imports consistently.
- Retain coverage for existing Takeout matching cases.
- Retain thumbnail failure and reuse tests.
- Retain export collision behaviour.
- Retain keeper persistence behaviour.
- Add tests for the application facade where orchestration moves out of IPC.
- Add migration tests listed above.
- Add a focused test for thumbnail reference-to-Electron-URL adaptation if that conversion is extracted.

## 7. Diagnostics requirements

Diagnostics are part of the product contract.

The refactor must preserve visible reporting for:

- Ambiguous sidecars.
- Missing sidecars.
- Unknown file types.
- Thumbnail failures.
- Metadata repair failures.
- Export failures.

Migration failures must be explicit startup errors. Do not swallow them and open the application against an unknown schema state.

Do not redesign the Diagnostics drawer in this milestone.

## 8. Data-safety requirements

- Never run metadata writes during tests against real media.
- Use temporary fixtures for all filesystem and database tests.
- Preserve dry-run before metadata writing.
- Preserve export collision handling.
- Do not add deletion of source media.
- Do not weaken path validation or expose new arbitrary filesystem operations.
- Do not destructively recreate an existing database.

## 9. Explicit non-goals

Do not implement any of the following in Milestone 0:

- HTTP server or REST endpoints.
- Dockerfile, Docker Compose or Unraid template.
- Watched `/inbox` processing.
- Browser upload.
- Persistent background-job queue.
- Exact-duplicate or similarity grouping.
- Blur, exposure, composition or face scoring.
- Keep/Maybe/Reject UI conversion.
- Authentication or multiple users.
- Face recognition.
- Event detection.
- Cloud storage or remote access.
- PostgreSQL, Redis or distributed workers.
- Full removal of Electron.
- Broad package upgrades.
- UI redesign beyond changes required for the client boundary.

When an attractive improvement belongs to a later milestone, document it instead of implementing it.

## 10. Suggested implementation sequence

### Phase A — Explore and map

1. Run baseline validation.
2. Map Electron imports and service dependencies.
3. Identify transport-specific thumbnail handling.
4. Inspect current database schema and test fixtures.
5. Confirm the intended move/rename plan before editing.

### Phase B — Documentation

1. Add `docs/product.md`.
2. Add `docs/architecture.md`.
3. Add `docs/roadmap.md`.
4. Rewrite the README status and links.

Documentation may be completed before or after code extraction, but it must describe the actual final state of this milestone.

### Phase C — Persistence migrations

1. Introduce migration definitions and runner.
2. Convert `LibraryStore` initialisation to use migrations.
3. Add fresh, repeat-open, legacy-adoption and failure tests.

### Phase D — Reusable application boundary

1. Move reusable services out of Electron ownership.
2. Add application facade.
3. Pass database/cache configuration from Electron.
4. Keep native dialogs and protocol handling in Electron.
5. Ensure owned resources close at shutdown.

### Phase E — Renderer client boundary

1. Define `PhotoFindClient`.
2. Add Electron client implementation.
3. Route feature calls through the client.
4. Verify direct `window.api` access is isolated.

### Phase F — Review and validation

1. Inspect the complete diff.
2. Check that moved logic was not accidentally rewritten.
3. Run all validation.
4. Perform the Electron acceptance workflow.
5. Confirm documentation matches the implementation.

## 11. Supervisor and worker execution

The supervisor owns architecture, scope decisions, review and final acceptance.

Recommended delegation:

- Use an `explorer` agent first for a read-only dependency and migration-risk map when available.
- Delegate the implementation as one bounded task to `luna_worker` because service moves, migrations and client boundaries have overlapping imports.
- Do not use parallel writing workers across these changes unless the supervisor can prove their files are disjoint.
- The supervisor must inspect the actual diff and run final validation independently of the worker summary.

The worker must not commit or push unless explicitly instructed by the user.

## 12. Validation commands

Run the baseline before implementation when the environment permits, then rerun after implementation:

```bash
npm run typecheck
npm test
npm run build
```

Also perform structural checks equivalent to:

```bash
# Electron imports should be confined to adapter code.
rg -n "from ['\"]electron['\"]" src

# Feature components should not directly depend on the preload global.
rg -n "window\.api" src/renderer
```

Expected final structural result:

- Electron imports only occur under intended Electron adapter/preload locations.
- `window.api` occurs only in the Electron renderer client adapter or associated type declaration, not in feature components.

If Linux packaging is available and already functional, run:

```bash
npm run pack:linux
```

Packaging is useful but not required when the execution environment lacks the necessary native tooling. Report it accurately.

## 13. Acceptance procedure

Use test fixtures or disposable sample media. Do not use the only copy of personal photographs.

### 13.1 Automated acceptance

All of the following must pass:

- TypeScript typecheck.
- Existing test suite.
- New migration tests.
- New application-facade tests.
- Production build.

### 13.2 Electron smoke acceptance

Launch the application and verify:

1. The existing import screen opens.
2. A disposable folder can be selected.
3. Scan results and media counts appear.
4. Thumbnails render through the Electron protocol.
5. Ambiguous, missing or unknown fixture files remain visible in Diagnostics.
6. Keeper marks persist across a rescan or restart as supported by the existing workflow.
7. Dry run completes before metadata repair becomes available.
8. Actual repair still requires explicit confirmation.
9. Selected keepers export without silently overwriting existing files.
10. The application shuts down without leaving its database resource in an invalid state.

### 13.3 Migration acceptance

Verify against disposable databases:

1. A fresh database is created and recorded at the current schema version.
2. Restarting does not change or duplicate migration records.
3. A database created by the pre-migration prototype retains existing rows after adoption.
4. A deliberately failing test migration rolls back and is not marked as applied.

### 13.4 Documentation acceptance

Confirm that:

- README does not describe Takeout repair as the complete product.
- Quick Sort and Library are equally visible.
- Current features are distinguished from planned features.
- The architecture document matches the final code boundaries.
- The roadmap matches the agreed milestones.

## 14. Completion criteria

Milestone 0 is complete only when:

- Product documentation reflects the curation-first direction.
- Reusable services are no longer structurally owned by Electron.
- Application orchestration is callable without IPC or Electron.
- Renderer feature components use a typed client boundary.
- Thumbnail storage identity is not canonically tied to an Electron URL.
- SQLite migrations safely handle fresh and existing prototype databases.
- Existing Electron functionality remains operational.
- Tests, typecheck and build pass.
- The supervisor has completed the smoke acceptance procedure or explicitly documented what could not be tested.

## 15. Required completion report

Use the completion format from `AGENTS.md` and include:

```text
Implemented
- Product documentation and architecture boundaries
- Migration framework and compatibility handling
- Application and renderer client boundaries

Changed files
- Important moves, additions and adapter changes

Validation
- Exact commands and smoke checks completed

Not verified
- Packaging, platform-specific behaviour or other unavailable checks

Risks / follow-up
- Any compatibility layer that Milestone 1 must remove or extend
- Any remaining Electron coupling
- Any migration assumptions
```

Do not claim Milestone 0 complete if existing functionality compiles but the legacy database adoption or Electron smoke workflow remains unverified.
