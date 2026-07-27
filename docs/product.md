# PhotoFind product

PhotoFind helps people reduce large, overwhelming photo collections into smaller,
useful, and meaningful selections while keeping irreplaceable originals protected.
Google Takeout repair is supported as an optional ingestion tool; it is not the
product's main workflow.

## Quick Sort

Quick Sort is a temporary batch-processing workflow:

1. Supply a folder or, in a later web milestone, upload a batch.
2. Generate previews and analysis.
3. Group exact duplicates, bursts, and near-identical images.
4. Recommend technically stronger candidates with understandable reasons.
5. Review each item as `unreviewed`, `keep`, `maybe`, or `reject`.
6. Export the chosen originals to a standalone collection.
7. Optionally remove the temporary job and generated cache.

Milestone 0 documents this direction. The current prototype supplies scanning,
thumbnails, keeper marks, and export, but does not yet implement grouping,
recommendations, or the complete four-state review workflow.

## Library

Library is a long-lived archive workflow:

1. Index source folders without moving their originals.
2. Browse and curate the archive over time.
3. Add timeline, similarity, people, places, and events as their milestones arrive.
4. Optionally share review with household members.
5. Export a standalone curated archive that remains useful without PhotoFind.

The current prototype has a small persistent media index and keeper store. It is not
yet the complete Library experience.

## Review and recommendations

Solo review stays the simple default. A future shared mode will store each person's
decision separately from the final collection decision; one reviewer must never
overwrite another reviewer's opinion.

Technical quality and memory value are different signals. A sharper image may be the
technical best in a burst, while a blurrier but unique family moment remains the
memory keeper. Recommendations should explain signals such as sharper faces, reduced
motion blur, open eyes, exposure, or framing. They assist a human decision and never
silently reject or delete media.

## Diagnostics

Diagnostics are part of the product contract, not development-only logging.
Ambiguous or missing sidecars, unknown file types, unsupported media, thumbnail
failures, metadata repair failures, skipped writes, and export failures must remain
visible with useful context.

## Media safety

- Treat original media as irreplaceable.
- Prefer read-only source libraries, especially for future container mounts.
- Run a visible dry run before metadata writes.
- Require explicit confirmation before enabling Repair Mode writes.
- Never silently overwrite, delete, reject, or discard source media.
- Keep export output independent of PhotoFind and include an auditable report.
- Use disposable fixtures for automated tests and acceptance checks.
