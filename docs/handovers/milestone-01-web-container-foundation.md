# Milestone 1 Handover — Web and Container Foundation

**Project:** PhotoFind  
**Milestone:** 1  
**Status:** Ready for implementation  
**Primary outcome:** Run the existing PhotoFind workflow through a same-origin browser UI and HTTP adapter inside an Unraid-friendly container, without duplicating or replacing the application and media-processing logic established in Milestone 0.

## 1. Objective

Add a production-capable web runtime around `PhotoFindApplication` while preserving the working Electron runtime.

At the end of this milestone:

- PhotoFind can run as one container on Unraid or ordinary Docker.
- The React UI is served to browsers by the PhotoFind server.
- A second computer on the LAN can open the UI and use the current scan, diagnostics, keeper and export workflow.
- HTTP routes call the existing `PhotoFindApplication` use cases rather than reimplementing scanning, persistence, repair or export.
- Browser-visible data uses scoped PhotoFind references and never exposes host or container absolute filesystem paths.
- Thumbnails are served through a restricted HTTP route from the configured thumbnail cache.
- Database, cache and output data survive container replacement and restart.
- The existing Electron application still builds and runs through its IPC adapter.
- The repository is ready for Milestone 2 to introduce durable ingestion jobs, browser uploads and watched inbox processing.

This milestone is a transport and deployment foundation. It is not yet the Quick Sort product experience.

## 2. Read before implementation

The supervisor and worker must read:

- `AGENTS.md`
- `README.md`
- `docs/product.md`
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/handovers/milestone-00-product-and-architecture-reset.md`
- `package.json`
- `electron.vite.config.ts`
- `src/application/PhotoFindApplication.ts`
- `src/persistence/`
- `src/services/`
- `src/shared/types.ts`
- `src/main/index.ts`
- `src/main/ipc.ts`
- `src/main/thumbnailProtocol.ts`
- `src/main/thumbnailUrl.ts`
- `src/preload/index.ts`
- `src/renderer/src/client.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/ImportView.tsx`
- Existing unit and integration tests

Inspect the complete repository and `git status` before editing. Preserve unrelated work.

## 3. Starting point

Milestone 0 established these ownership boundaries:

```text
React feature components
        |
typed PhotoFindClient + separate folder selection capability
        |
Electron renderer adapter
        |
preload and Electron IPC adapter
        |
PhotoFindApplication
        |
reusable services + SQLite persistence/migrations
```

Milestone 1 adds sibling web adapters:

```text
                                +----------------------+
                                | Electron renderer    |
                                | client + folder UI   |
                                +----------+-----------+
                                           |
React feature components -----------------+------------------+
                                           |                  |
                                +----------v-----------+      |
                                | HTTP browser client  |      |
                                | + mounted folder UI  |      |
                                +----------+-----------+      |
                                           |                  |
                                +----------v-----------+      |
                                | HTTP server adapter  |      |
                                | path policy + routes |      |
                                +----------+-----------+      |
                                           |                  |
                                +----------v------------------v--+
                                | PhotoFindApplication           |
                                +---------------+-----------------+
                                                |
                                reusable services + persistence
```

Electron and HTTP are adapters around the same application facade. Do not fork the domain logic into an Electron implementation and a server implementation.

## 4. Fixed decisions

### 4.1 Runtime and server

- Keep Node.js 20 as the supported runtime.
- Keep TypeScript for the server.
- Use a small Node HTTP framework suitable for typed route tests and static-file serving. The expected choice is Fastify with its static-file plugin unless repository inspection reveals a concrete blocker.
- Serve the browser UI and API from the same origin.
- Do not enable permissive CORS.
- The production server must run without Electron installed as a production dependency.
- The default local-development bind address should be `127.0.0.1`.
- The container configuration should explicitly bind `0.0.0.0`.
- The default HTTP port is `3000`, configurable through environment variables.

Any different framework choice must be justified in the implementation report and must not add a second application architecture.

### 4.2 Container mounts

The container uses these configurable defaults:

```text
/config   database, configuration and migration state
/cache    generated thumbnails, previews and future analysis data
/photos   permanent source libraries; read-only by default
/inbox    temporary source batches; ingestion automation comes in Milestone 2
/exports  completed exports and reports
```

Do not hard-code these paths inside reusable application or service modules.

Use a server configuration layer with environment-variable overrides. Expected variables:

```text
PHOTOFIND_HOST
PHOTOFIND_PORT
PHOTOFIND_CONFIG_DIR
PHOTOFIND_CACHE_DIR
PHOTOFIND_PHOTOS_DIR
PHOTOFIND_INBOX_DIR
PHOTOFIND_EXPORTS_DIR
PHOTOFIND_ENABLE_METADATA_REPAIR
```

Reasonable non-container defaults under a local development data directory are allowed, but must be documented and must not point at the user's real photo folders automatically.

### 4.3 Trusted-LAN deployment

Milestone 1 provides a trusted-LAN service only.

- No user accounts or multiuser review yet.
- No built-in public internet exposure.
- No permissive cross-origin API.
- Documentation must explicitly say not to publish the port directly to the internet.
- Cloudflare Access, Tailscale and household authentication remain later deployment work.

The absence of authentication does not permit weak path handling. All filesystem access must still be scoped and validated server-side.

### 4.4 Request-bound operations

Scan, repair and export may remain request-bound in Milestone 1. Do not implement a queue or durable jobs here.

This means the browser runtime is initially intended for foundation testing and modest folders. Milestone 2 will add persistent, resumable background processing suitable for large batches.

Do not hide this limitation by claiming large scans are durable.

## 5. Scoped filesystem references

The current internal application model uses absolute paths. Those paths may remain internal to `PhotoFindApplication`, services and persistence during this milestone.

The HTTP API must not expose or accept arbitrary host/container absolute paths.

### 5.1 PhotoFind scoped URI

Introduce one adapter-level scoped reference format for browser traffic:

```text
photofind://photos/Family/2024
photofind://inbox/Baby%20swim%202026-07-20
photofind://exports/Selected%20photos
```

Rules:

- The URI authority identifies a configured public root: `photos`, `inbox` or `exports`.
- The path is relative to that root.
- Use URL encoding per segment.
- Use `/` as the canonical URI separator on every operating system.
- Empty relative paths represent the root itself.
- Browser code treats these strings as identifiers, not operating-system paths.
- The HTTP adapter resolves them to internal absolute paths only after validation.

The existing renderer contracts may continue using string `path` fields if the HTTP adapter maps every browser-visible path to a scoped URI. Update misleading comments that claim every client path is absolute.

Electron may continue using local absolute paths through its trusted local IPC adapter. Feature components must not parse paths or depend on Windows drive-letter syntax.

### 5.2 Path policy

Create one central server-side path policy/resolver. Every HTTP route touching the filesystem must use it.

It must:

- Recognise only configured root identifiers.
- Reject operating-system absolute paths supplied by clients.
- Reject `..`, NUL bytes, malformed encoding and separator tricks.
- Resolve and normalise against the configured root.
- Verify the result remains inside the configured root.
- Use real-path containment for existing paths so symlinks cannot escape a root.
- For new export directories, validate the nearest existing parent before creation.
- Enforce root capabilities:
  - `photos`: browse and scan; read-only by default.
  - `inbox`: browse and scan; no upload/watcher in this milestone.
  - `exports`: browse, create destination folders and export.
  - `config` and `cache`: never general browser roots.
- Return safe, structured errors rather than raw filesystem exceptions.

The scoped URI format is not itself the security boundary. Validation and containment are mandatory even for apparently well-formed URIs.

### 5.3 Browser response mapping

Before returning application results over HTTP:

- Map media, sidecar and keeper paths to scoped PhotoFind URIs.
- Map alternate sidecars as well.
- Do not return database paths, cache roots or source absolute paths.
- Do not return canonical thumbnail filesystem paths.
- Set browser thumbnail URLs to the restricted HTTP thumbnail endpoint.
- Preserve names, kinds, sizes, confidence, reasons, summary data and diagnostics.

Before calling application methods from HTTP:

- Resolve every scoped source/media/sidecar/export reference through the path policy.
- Reconstruct the existing internal application arguments.
- Reject mixed or invalid roots with a clear 4xx response.

## 6. HTTP API

Use a versionable route namespace. `/api` is sufficient for this milestone; keep route and contract ownership isolated so `/api/v1` can be introduced later without touching domain logic.

Exact route naming may be refined, but the API must provide the following behaviour.

### 6.1 Health and readiness

```text
GET /api/health
GET /api/ready
```

`/api/health`:

- Liveness only.
- Returns 200 when the process and HTTP server are running.
- Does not disclose filesystem paths.

`/api/ready`:

- Returns 200 only after configuration validation, directory preparation, SQLite migration and `PhotoFindApplication` startup succeeded.
- Returns 503 with safe reason codes when not ready.
- Must not include secrets or absolute paths.

The container health check should use the health or readiness endpoint through Node, without requiring `curl` to be installed.

### 6.2 Capabilities and roots

Provide a safe endpoint describing browser capabilities and selectable roots.

It should identify:

- Application version.
- Available source roots (`photos`, `inbox`).
- Available export root.
- Browse/select/create capabilities.
- Whether metadata write repair is enabled.
- That uploads, background jobs and multiuser review are unavailable.

Never return the mounted absolute paths.

### 6.3 Directory browsing

Provide a route to browse directories under an allowed root.

Requirements:

- Directories only are sufficient for selection.
- Return a scoped URI, display name and selectable capability for each entry.
- Support root navigation and breadcrumbs without revealing the internal mount path.
- Sort directories predictably.
- Skip or clearly report inaccessible entries.
- Do not follow symlinks outside a configured root.
- Reject browsing of `/config`, `/cache` or arbitrary paths.

Provide a restricted create-directory operation for export destinations if needed by the web picker. It may create only a single validated child directory under the export root or an already validated export subdirectory.

### 6.4 Existing application operations

Expose the current workflow through HTTP:

- Scan a selected source directory.
- Perform a metadata dry run.
- Perform metadata repair only when explicitly enabled and confirmed.
- Set or clear the current keeper flag.
- Export selected keepers to a destination under the exports root.

The routes must delegate to `PhotoFindApplication`.

Do not copy scanning, sidecar matching, repair, keeper persistence or export logic into route handlers.

### 6.5 Metadata repair safety

Browser metadata writes are disabled by default.

- Dry-run remains available for valid scoped source references.
- Actual write repair requires `PHOTOFIND_ENABLE_METADATA_REPAIR=true`.
- The request must contain an explicit confirmation field in addition to the UI confirmation.
- The API must reject write repair when disabled even if the client enables its button incorrectly.
- Documentation should keep `/photos` mounted read-only by default.
- Electron repair behaviour remains explicit and unchanged.

### 6.6 Error envelope

All API errors should use one predictable JSON shape, for example:

```json
{
  "error": {
    "code": "PATH_OUTSIDE_ROOT",
    "message": "The selected folder is outside an allowed PhotoFind source."
  }
}
```

Requirements:

- Use appropriate HTTP status codes.
- Do not expose stack traces or raw absolute paths to the browser.
- Log server-side context with an operation/request identifier.
- The HTTP client must turn failed responses into visible UI diagnostics.
- Do not catch failures and return success-shaped responses.

## 7. Thumbnail HTTP adapter

Add a browser thumbnail route backed by the canonical cache created by the existing thumbnail service.

Expected shape:

```text
GET /api/thumbnails/<cache-key>.webp
```

Requirements:

- Derive the public key from the canonical thumbnail filename, not an arbitrary caller-supplied path.
- Accept only the expected key/extension format.
- Resolve only inside the configured thumbnail cache.
- Return `image/webp` and sensible cache headers.
- Return 404 for missing/read-race files.
- Reject traversal and encoded separator attempts.
- Never serve original media through this route.
- Do not reuse the Electron `photofind-thumb://` URL in browser responses.

The Electron custom protocol remains supported and tested separately.

## 8. Browser client and UI adaptation

### 8.1 Shared React application

Use the existing React feature components. Do not create a separate server-only UI.

The browser bundle must:

- Start without `window.api` being present.
- Select the HTTP client in an ordinary browser.
- Select the Electron client when running under the existing preload bridge.
- Avoid importing Electron modules into the browser bundle.
- Use the same scan, diagnostics, keeper and export components where practical.

### 8.2 HTTP client

Add an implementation of `PhotoFindClient` that:

- Calls same-origin `/api` routes.
- Serialises scoped URI references.
- Maps HTTP errors into typed client errors.
- Never assumes a Windows path or local filesystem access.
- Supports cancellation where straightforward, without implementing persistent jobs.

### 8.3 Mounted folder picker

A browser cannot use the Electron native folder dialog to select server-mounted folders.

Add a modest mounted-directory picker for browser mode:

- Choose `Photos` or `Inbox` as a source.
- Navigate permitted subdirectories.
- Select the current directory for scanning.
- Choose or create a destination under `Exports`.
- Display PhotoFind-relative names, not `/photos` or host paths.
- Clearly distinguish source selection from export selection.

This is foundation UI, not the final Quick Sort import experience. Do not add upload, drag-and-drop or watched-inbox controls yet.

### 8.4 Existing workflow preservation

In both Electron and browser mode, retain:

- Source selection.
- Scan summary.
- Metadata health.
- Diagnostics drawer.
- Thumbnail grid.
- Dry-run-before-repair behaviour.
- Explicit repair confirmation.
- Keeper selection and persistence.
- Collision-safe export and export report.

A broad visual redesign is not part of Milestone 1.

## 9. Server lifecycle and configuration

Create a server entry point independent of Electron.

Startup sequence:

1. Parse and validate configuration.
2. Create required writable directories (`config`, `cache`, `inbox`, `exports`) when safe.
3. Validate source-root readability.
4. Construct the path policy/root registry.
5. Construct one `PhotoFindApplication` instance with the configured database and thumbnail cache.
6. Register API and static routes.
7. Mark readiness only after application creation and migrations succeed.
8. Listen on the configured host and port.

Shutdown sequence:

- Handle `SIGINT` and `SIGTERM`.
- Stop accepting requests.
- Close the HTTP server.
- Close `PhotoFindApplication` and SQLite exactly once.
- Exit non-zero on unrecoverable startup failure.
- Produce a clear log message without dumping secrets.

Do not allow multiple application instances to open the same database within one process.

## 10. Browser and server builds

Add explicit scripts for the server/browser runtime while preserving existing Electron scripts.

Expected capabilities:

```text
npm run dev              existing Electron development runtime
npm run build            existing Electron production build
npm run typecheck
npm test

npm run build:web        browser bundle
npm run build:server     server bundle
npm run build:webapp     browser + server production build
npm run start:web        run the built server
```

Names may vary slightly if well justified, but Electron and web build purposes must remain unambiguous.

The production server should serve the built browser assets. Development may use separate server and Vite processes or another simple documented workflow. Avoid adding a complex monorepo or build orchestrator for this milestone.

## 11. Container deliverables

### 11.1 Dockerfile

Add a multi-stage Dockerfile based on a Node.js 20 Debian-family image rather than Alpine, because the application uses native Node dependencies.

Requirements:

- Build browser and server assets in the build stage.
- Install only production dependencies in the final image.
- Do not include Electron or Electron packaging output in the final runtime image.
- Ensure `better-sqlite3`, Sharp and ExifTool dependencies function in the Linux image.
- Create the expected mount points.
- Expose the configured default port.
- Use a production `NODE_ENV`.
- Provide a health check.
- Keep the image free of imported photos, database files, generated thumbnails and export output.
- Support running with a Docker numeric `user:` override; do not add an elaborate privilege-management entrypoint in this milestone.

### 11.2 `.dockerignore`

Exclude at least:

- `.git`
- local databases
- imported media
- cache and export directories
- Electron release output
- development logs
- unrelated local artefacts

Do not exclude source files needed for a reproducible build.

### 11.3 Compose example

Add a Compose example suitable for local testing and understandable for Unraid users.

Expected properties:

- Port mapping for the web UI.
- Persistent writable mounts for `/config`, `/cache`, `/inbox` and `/exports`.
- Read-only `/photos` mount.
- `restart: unless-stopped`.
- `init: true` or equivalent clean signal handling.
- Environment-variable examples.
- Optional numeric `user:` example with a clear permissions note.

Do not commit machine-specific host paths as working defaults.

### 11.4 Unraid documentation

Add concise deployment documentation showing the expected Unraid mappings, for example:

```text
/mnt/user/appdata/photofind/config  -> /config
/mnt/user/appdata/photofind/cache   -> /cache
/mnt/user/photos                    -> /photos   (read-only)
/mnt/user/photofind-inbox           -> /inbox
/mnt/user/photofind-exports         -> /exports
```

Also document:

- Container port.
- Required write permissions.
- Read-only photo recommendation.
- Browser URL on the LAN.
- Container restart/update persistence expectations.
- Trusted-LAN limitation.
- No Community Applications submission/template is required in this milestone.

## 12. Database and persistence

- Reuse the Milestone 0 migration framework.
- Store the database under the configured config directory.
- Do not introduce a second database for the web runtime.
- Container restart must retain keeper state and indexed rows.
- Do not add background-job tables yet.
- Add migrations only when genuinely required by the web adapter.
- Never destructively recreate an existing compatible database.

A container using a database created by the current Electron prototype should either migrate/adopt it safely or fail clearly according to the existing migration rules.

## 13. Security requirements

Tests and review must explicitly cover:

- `../` traversal.
- URL-encoded traversal.
- Windows drive paths and UNC-like input supplied to the HTTP API.
- Backslash separator tricks.
- NUL and malformed URI input.
- Symlink escape from an allowed root.
- Thumbnail traversal and arbitrary-file attempts.
- Export outside `/exports`.
- Repair write while disabled.
- No absolute host/container path leakage in successful API responses or normal error responses.
- No original-media download endpoint.
- No permissive CORS.

Set basic same-origin response headers directly or through a small, justified mechanism:

- `X-Content-Type-Options: nosniff`
- A Content Security Policy compatible with the current application.
- A conservative referrer policy.

Do not add a large security framework solely for these headers.

## 14. Required tests

### 14.1 Unit tests

Add focused tests for:

- Scoped URI encode/decode across Windows and POSIX hosts.
- Root capability enforcement.
- Valid containment and traversal rejection.
- Symlink escape rejection where supported by the test OS.
- Non-existing export-child validation.
- Thumbnail-key validation.
- HTTP response mapping strips internal paths.

### 14.2 HTTP integration tests

Use the server framework's injection/test facility where possible.

Cover at least:

- Health and readiness success.
- Readiness/startup failure reporting without path leakage.
- Safe root listing.
- Directory browsing.
- Invalid root and traversal rejection.
- Scan against a disposable fixture.
- Scan response contains scoped PhotoFind URIs and HTTP thumbnails only.
- Thumbnail bytes are served with the correct content type.
- Metadata dry run.
- Metadata write rejection when disabled.
- Keeper update followed by rescan persistence.
- Export under the exports root.
- Existing export collision remains non-destructive.
- Structured API errors.

### 14.3 Existing regression suite

All existing Milestone 0 tests must continue to pass, including:

- Sidecar matching.
- Thumbnail generation.
- Electron thumbnail URL/path handling.
- Migration behaviour.
- Library persistence.
- Application orchestration.
- Export collision handling.

### 14.4 Container smoke

Build and run the image against disposable mounted directories.

Verify:

1. Health becomes healthy.
2. The browser UI loads.
3. A mounted source folder can be selected and scanned.
4. Recognisable thumbnails render in a normal browser.
5. Diagnostics are visible.
6. A keeper mark survives browser refresh and container restart.
7. Export writes only beneath the mounted exports directory.
8. An existing export filename is preserved.
9. The photos mount is read-only in the documented configuration.
10. Container shutdown is graceful and the database reopens successfully.

## 15. Acceptance procedure

The milestone is complete only when the supervisor has reviewed the actual diff and the following are satisfied.

### 15.1 Automated validation

Run under Node.js 20:

```text
npm run typecheck
npm test
npm run build
npm run build:webapp
git diff --check
docker build ...
```

Use the final script names added by the implementation.

Never claim Node 20 validation if commands were run only under another Node version.

### 15.2 HTTP safety inspection

Using a disposable fixture, inspect representative JSON responses and confirm they contain none of:

- The fixture host path.
- Windows drive-letter absolute paths.
- Container paths such as `/photos/...`, `/cache/...` or `/config/...`.
- SQLite paths.
- Canonical thumbnail filesystem paths.

Scoped `photofind://...` URIs and `/api/thumbnails/...` URLs are expected.

### 15.3 Browser acceptance

From a second computer or a genuinely separate browser context:

1. Open the PhotoFind LAN URL.
2. Browse a mounted source directory.
3. Run a small scan.
4. Confirm real thumbnails render.
5. Mark a keeper.
6. Rescan and confirm the keeper persists.
7. Export the keeper beneath the exports root.
8. Confirm diagnostics show unsupported, uncertain or missing cases from a disposable fixture.
9. Confirm metadata write is visibly unavailable when disabled.

### 15.4 Restart acceptance

- Restart the container without deleting mounted data.
- Confirm readiness returns.
- Confirm the database opens without reapplying migrations incorrectly.
- Confirm keeper state remains.
- Confirm cached thumbnails are reused where expected.

### 15.5 Electron regression smoke

On a supported desktop environment:

- Start the existing Electron application.
- Select and scan a small disposable folder.
- Confirm Electron protocol thumbnails render.
- Confirm dry-run/confirmation, keeper persistence and export still function.

Do not accept the milestone merely because the web runtime works if Electron was broken by shared-client changes.

## 16. Explicit non-goals

Do not implement these in Milestone 1:

- Browser file upload or drag-and-drop ingestion.
- Watched inbox automation.
- Durable background jobs, queues, progress recovery or resume.
- Quick Sort sessions as a persistent entity.
- `unreviewed`, `keep`, `maybe`, `reject` migration beyond existing keeper compatibility.
- Duplicate, burst or similarity grouping.
- Technical-quality scoring or recommendations.
- Face recognition, people, places or events.
- User accounts, authentication or shared review.
- Cloud storage or cloud processing.
- Cloudflare Tunnel, Tailscale or public deployment automation.
- Original-media download/streaming API.
- PostgreSQL, Redis, distributed queues or microservices.
- Separate ML worker containers.
- Unraid Community Applications publication.
- Removal of Electron.
- Broad UI redesign.

## 17. Likely files and areas

Exact names may differ after repository inspection, but expected additions/changes include:

```text
src/server/                         server entry, config, lifecycle
src/server/http/                    routes, errors, response mapping
src/server/paths/                   root registry, scoped URI and containment policy
src/renderer/src/client.ts          runtime client selection
src/renderer/src/httpClient.ts      browser HTTP adapter
src/renderer/src/components/        mounted directory picker and small integration changes
src/shared/                         serialisable client/error/capability contracts as needed
package.json                        web/server scripts and dependencies
tsconfig.server.json                server compilation
a browser Vite configuration        standalone browser build
Dockerfile
.dockerignore
compose.yaml or docker-compose.yml
docs/deployment/unraid.md
README.md
docs/architecture.md
docs/roadmap.md
```

Do not move reusable services back under an adapter-specific folder.

## 18. Suggested supervisor/worker decomposition

The supervisor retains architecture, scope and final acceptance.

A safe sequential decomposition is:

1. **Path and contract slice**
   - Scoped URI codec.
   - Root registry and containment policy.
   - Safe response/request mapping.
   - Unit tests.

2. **HTTP server slice**
   - Configuration and lifecycle.
   - Health/readiness.
   - Browse, scan, repair, keeper, export and thumbnail routes.
   - HTTP integration tests.

3. **Browser adapter slice**
   - HTTP client.
   - Runtime adapter selection.
   - Mounted folder picker.
   - Visible error diagnostics.
   - Browser smoke.

4. **Container and documentation slice**
   - Production builds.
   - Dockerfile, ignore file and Compose example.
   - Unraid deployment guide.
   - Container smoke.

Review each slice before starting the next. Shared contracts and build files make broad concurrent writing risky. Parallel read-only investigation is fine.

If delegated workers propose implementing Milestone 2 job infrastructure to solve long scans, reject that scope expansion. Record request-bound scanning as a known Milestone 1 limitation.

## 19. Completion report

Use the `AGENTS.md` completion format and include:

```text
Implemented
- HTTP/server functionality
- Browser functionality
- Container/deployment functionality

Changed files
- Important files and ownership boundaries

Validation
- Exact Node version
- Typecheck, tests and Electron/web builds
- Docker build and container smoke
- Browser and Electron acceptance checks

Not verified
- Anything not exercised on Windows, Linux, Docker or Unraid

Risks / follow-up
- Request-bound scan limitations
- Trusted-LAN/no-auth limitation
- Permissions or platform caveats
- Exact Milestone 2 dependencies
```

Do not report Milestone 1 complete if the image was not built and run, browser API responses leak internal paths, persistence was not tested across restart, or Electron regression acceptance was skipped without a clear unresolved status.
