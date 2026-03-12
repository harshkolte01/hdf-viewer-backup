# js/utils

Shared helper utilities used across the SPA API layer, state reducers, renderers, and runtimes.

All utilities are published on `window.HDFViewer.utils.*` and also on `window.*` for direct access by older modules.

## Files

### `lru.js`

What it does:
- bounded Least-Recently-Used cache implemented with `Map`

Used by:
- `spa/js/api/hdf5Service.js`
- `spa/js/components/viewerPanel/shared.js`

### `format.js`

What it does:
- provides lightweight formatting helpers

Exports:
- `escapeHtml(value)` - escapes untrusted text before inserting HTML
- `formatBytes(bytes)` - converts bytes to human-readable units

SPA note:
- `escapeHtml()` is used in both the main display renderers and the sidebar metadata panel

### `export.js`

What it does:
- builds export filenames
- escapes CSV cells safely
- creates blobs
- triggers CSV and PNG downloads

Used by:
- matrix, line, and heatmap runtimes
