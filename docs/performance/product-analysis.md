# Product photo analysis performance

Semantic Product Photos uses Transformers.js with ONNX Runtime Web.

## CPU / WASM

When WebGPU is unavailable, PhotoFind uses the browser WASM backend. Production responses opt into Chrome Document Isolation Policy (`isolate-and-credentialless`) so supported desktop Chromium versions expose `crossOriginIsolated` and WebAssembly threads without requiring COOP/COEP popup restrictions.

PhotoFind configures the WASM backend before model initialization:

- no cross-origin isolation: 1 thread
- isolated page: half of `navigator.hardwareConcurrency`, capped at 8 threads

Examples: 4 logical CPUs -> 2 threads, 8 -> 4, 12 -> 6, 16+ -> 8.

The cap leaves CPU capacity for decoding, browser UI, IndexedDB persistence and the rest of the desktop while semantic analysis runs.

The production build already self-hosts the SIMD + threaded ONNX Runtime Web assets under `/onnx-wasm/`.

## WebGPU

PhotoFind probes `navigator.gpu.requestAdapter()` before selecting WebGPU. Merely exposing `navigator.gpu` is not treated as proof that a usable GPU adapter exists. If no adapter is available, WebGPU is skipped entirely and CPU/WASM is used.

## Future throughput work

Transformers.js zero-shot image classification accepts multiple input images. Small semantic batches may improve total throughput further, but should be benchmarked separately because batching increases transient image/model memory and changes per-photo failure/persistence handling.
