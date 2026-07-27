# PhotoFind

PhotoFind is a local, self-hosting-ready photo-curation tool for turning overwhelming
collections into smaller, useful selections. It has two equal workflows:

- **Quick Sort** processes a temporary batch, helps review it, and exports chosen originals.
- **Library** indexes a long-lived archive without moving its source media.

Originals remain protected. Google Takeout metadata repair is an optional ingestion
feature, not the centre of the product.

## Current status

The current Electron prototype scans folders, matches Takeout sidecars, generates
thumbnails, reports diagnostics, persists keeper marks, performs explicitly confirmed
metadata repair, and exports selected originals without silent overwrite.

Milestone 0 established reusable application, service, persistence, migration, and
renderer-client boundaries. Milestone 1 adds browser/server builds and a trusted-LAN
container foundation. Scanning remains request-bound; durable jobs, similarity
grouping, the full Keep/Maybe/Reject workflow and multiuser review remain planned.

## Development

Requires Node.js 20 (the current environment may use a newer runtime).

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run build:webapp
npm run start:web # after build:webapp
npm run pack:linux # optional when Linux packaging tooling is available
```

See [Unraid deployment](docs/deployment/unraid.md) and [compose.yaml](compose.yaml)
for container usage. Set `PHOTOFIND_STATIC_DIR` to the built browser directory when
running the standalone server outside the image.

`better-sqlite3` is a native dependency. The existing scripts rebuild it for the
active Node or Electron ABI when required.

See the [product](docs/product.md), [architecture](docs/architecture.md), and
[roadmap](docs/roadmap.md) documents for the deeper direction and safety boundaries.
