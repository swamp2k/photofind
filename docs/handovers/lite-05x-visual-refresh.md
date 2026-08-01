# Lite 5.x — Visual refresh and curation completion

## Goal

Validate the new photo-first application shell and the complete Lite 5.1–5.4 curation workflow against real disposable media in a supported browser.

Automated validation covers TypeScript, unit tests and the static production build. It does not prove browser file permissions, responsive layout, image interaction or metadata writes.

## Preconditions

- Cloudflare Pages preview or production deployment for the relevant commit.
- Desktop Chromium-based browser exposing `showDirectoryPicker()` for the full export test.
- A disposable source folder containing:
  - several ordinary JPEG images;
  - at least one JPEG whose date/GPS comes from a Google Takeout JSON sidecar or repaired EXIF;
  - one non-JPEG image such as PNG or WebP with reliable normalized date/GPS;
  - a few similar/burst images;
  - no irreplaceable-only copy of any test file.
- An empty disposable export destination folder.
- An independent metadata inspector such as ExifTool, Windows file properties, macOS Preview/Photos, or another trusted EXIF reader.

## 1. Visual shell

- Open PhotoFind at desktop width.
- Confirm the compact top bar, search, local-only state, left task navigation and local indexes render without horizontal overflow.
- Confirm Library, Map, Groups, Quality, Review, Compare and Selection are understandable as distinct tasks.
- Confirm advanced filters and Diagnostics use progressive disclosure rather than permanently dominating the page.
- Confirm photos remain the dominant visual material.
- Resize through tablet and approximately 320–400 CSS pixels.
- Confirm mode navigation remains reachable, controls stack rather than clip, and the photo grid remains usable.
- Confirm keyboard focus is visible.
- With reduced-motion enabled at OS/browser level, confirm transitions are effectively suppressed.

## 2. Search and filters

- Search by part of a filename.
- Search by a source-folder path segment.
- Search by camera make/model when available.
- Combine search with date, location and review filters.
- Confirm result counts and Groups/Compare context update consistently.
- Reset filters and confirm the full local library returns.

## 3. Full-size viewer

- Open a photo from Library.
- Navigate using left/right buttons and arrow keys.
- Use `Z`, `+`, `-` and double-click to change zoom.
- At 2× or 4×, drag/pan the photo.
- Select another photo from the filmstrip and confirm zoom/pan reset.
- Apply Keep/Maybe/Reject and reset using both controls and `K/M/R/U`.
- Close using `Esc`.

## 4. Focused Review mode

- Apply a small filter so the session contains a known set of photos.
- Enter Review.
- Confirm the session contains exactly the current filtered results.
- Make decisions using K, M and R.
- Confirm each decision advances to the next photo.
- Navigate backward and revise a previous decision.
- Exit with `Esc`.
- Refresh/reopen the library and confirm decisions persisted.

## 5. Compare / Pick Best

- Run similarity analysis if the test library has not already been analyzed.
- Enter Compare.
- Confirm related candidates remain visible together even when a review filter selected the group.
- Confirm the technical suggestion is presented as guidance, not an automatic choice.
- Select a candidate and use Keep/Maybe/Reject individually.
- On a disposable group, use **Keep one · reject others**.
- Confirm the selected item becomes Keep and all alternatives become Reject as one completed action.
- Refresh/reopen and confirm every decision persisted.

## 6. Metadata-aware JPEG export

- Mark the repaired/Takeout-backed JPEG as Keep.
- Open Selection.
- Leave **Embed repaired metadata** enabled.
- Export to the empty disposable destination.
- Confirm PhotoFind reports the JPEG under embedded metadata.
- Inspect the exported JPEG independently:
  - `DateTimeOriginal` matches PhotoFind's reliable normalized capture time;
  - GPS matches PhotoFind's normalized coordinates when available;
  - existing camera EXIF remains present where the original contained it;
  - the exported image opens and renders normally.
- Compare source and destination:
  - source bytes/mtime/metadata are unchanged;
  - only the destination copy was rewritten.

Suggested ExifTool check:

```text
exiftool -DateTimeOriginal -GPSLatitude -GPSLongitude -Make -Model <exported-file.jpg>
```

## 7. XMP fallback

- Export the non-JPEG item with reliable normalized metadata.
- Confirm the media file is copied unchanged.
- Confirm a neighbouring `.xmp` file is created.
- Open the XMP as text or with a metadata-aware application and confirm it contains normalized capture date and/or GPS plus source provenance.
- Confirm the export result/report identifies the sidecar.

## 8. Collision and report safety

- Export the same selection into the same destination again.
- Confirm existing media, XMP and reports are not overwritten.
- Confirm safe numbered filenames are used.
- Open the generated HTML report and confirm it describes embedded, XMP and unchanged metadata outcomes.
- Inspect the JSON report for the same information.

## 9. Failure handling

- Cancel the export-folder picker and confirm no false failure/success is reported.
- Revoke or deny source access and confirm Review/Compare/Export clearly request reconnection.
- Test an unsupported or deliberately malformed image copy and confirm the failure is visible without aborting unrelated exports silently.

## Acceptance

Lite 5.x is accepted when:

- the refreshed UI is pleasant and usable on desktop and narrow layouts;
- search, viewer, Review and Compare behave coherently;
- decisions persist;
- JPEG date/GPS metadata is independently verified in exported copies;
- unsupported rewrite formats receive valid XMP sidecars;
- repeated exports never overwrite existing files;
- source media remains unchanged;
- no photo bytes or private index data appear in network requests other than ordinary map tiles when Map is used.
