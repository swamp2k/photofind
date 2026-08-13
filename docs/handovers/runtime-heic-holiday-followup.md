# Runtime HEIC and holiday follow-up

Validation target after the August 13 runtime fixes:

- Cloudflare Pages serves the current main bundle with `People` followed by `Duplicates` in primary navigation.
- `/api/holidays?country=DK&year=2026` returns JSON from the same-origin Pages Function.
- Holiday import no longer depends on browser-to-Nager.Date CORS/network access.
- HEIC/HEIF preview conversion uses blob-first JPEG conversion and returns a visible error after a bounded timeout instead of loading forever.
- HEIC quality/similarity workers use the worker-safe `heic-to/next` entry point with the same blob-first conversion.
- Source HEIC/HEIF files remain read-only.

Browser acceptance should use at least one of the older iPhone HEIC files that previously stayed on `Loading local photo…`.
