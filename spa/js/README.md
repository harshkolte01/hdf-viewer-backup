# js

Plain-script runtime source for the `spa/` viewer.

No bundler or transpiler is used. Each file is an IIFE that registers itself on `window.HDFViewer`.

## Architecture Overview

```text
app-viewer.js          <- bootstrap entry point
    v
views/viewerView.js    <- shell rendering and event routing
    v
components/            <- sidebar tree, sidebar metadata, main display panel
state/                 <- global store and action factories
api/                   <- backend calls and frontend caches
utils/                 <- shared helpers
core/                  <- namespace, config, DOM references
```

## Main Entry

| File | Purpose |
|------|---------|
| `app-viewer.js` | Validates dependencies, reads `?file=`, opens the viewer, subscribes to state changes, and re-renders the shell. |

## Subsystem Folders

| Folder | What it contains |
|--------|------------------|
| `core/` | namespace bootstrap, runtime config, DOM ID contract |
| `utils/` | helpers for formatting, caching, and export |
| `api/` | HTTP client, payload normalizers, HDF5 API facade |
| `state/` | global store plus action modules |
| `components/` | tree, sidebar metadata, display panel renderers and runtimes |
| `views/` | shell-level orchestration and event delegation |

## SPA Shell Behavior

- `spa/index.html` owns the shell markup and the host URL bridge.
- The main panel is display-only in this SPA copy.
- Metadata is rendered in the sidebar below the tree.
- `viewMode` remains in state for compatibility with shared modules, but the SPA pins it to `"display"`.

## Script Load Order

Dependencies are enforced only by script order in `spa/index.html`:

```text
core/ -> utils/ -> api/ -> state/ -> components/ -> views/ -> app-viewer.js
```
