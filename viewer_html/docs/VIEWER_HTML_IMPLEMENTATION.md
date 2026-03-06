# Viewer HTML Implementation Walkthrough

This document explains how `viewer_html` works in source-code order, using simple language.

## 1) Entry shell and load order (`viewer_html/index.html`)

`index.html` is a static shell with fixed element IDs.

Important IDs:
- `viewer-app`
- `viewer-sidebar`
- `viewer-topbar`
- `viewer-subbar`
- `display-pane`
- `inspect-pane`
- `global-status`

Why this matters:
- JS modules do not create a new app root.
- They update these fixed shell regions.

Script order is strict:
1. `config/runtime-config.js`
2. `js/core/*`
3. `js/utils/*`
4. `js/api/*`
5. `js/state/*`
6. `js/components/*`
7. `js/views/viewerView.js`
8. `js/app-viewer.js`

No bundler/import system is used. Dependency order is guaranteed by script tags.

## 2) Core layer (`viewer_html/js/core`)

### `namespace.js`

- Creates `window.HDFViewer`
- Provides helpers:
  - `ensurePath`
  - `registerModule`
  - `requireModules`

This is the base contract for every other file.

### `config.js`

- Reads `window.__CONFIG__`
- Resolves `API_BASE_URL` (default `http://localhost:5000`)
- Exposes endpoint builders:
  - `/files`
  - `/files/:key/children`
  - `/files/:key/meta`
  - `/files/:key/preview`
  - `/files/:key/data`
  - `/files/:key/export/csv`

### `domRefs.js`

- Defines required DOM IDs
- Provides helpers to set HTML, hide/show regions, and update statuses

## 3) API layer (`viewer_html/js/api`)

### `client.js`

- Wraps `fetch`
- Supports cancel keys and abort propagation
- Normalizes errors into `ApiError`

Key behavior:
- If `cancelPrevious` is true for a cancel key, old request is aborted.

### `contracts.js`

- Normalizes backend payloads to stable frontend shapes
- Covers:
  - files list
  - tree children
  - metadata
  - preview
  - data (matrix/line/heatmap)

This keeps reducers/renderers simple and predictable.

### `hdf5Service.js`

- Frontend-facing service API:
  - `getFiles`
  - `refreshFiles`
  - `getFileChildren`
  - `getFileMeta`
  - `getFilePreview`
  - `getFileData`
- Adds cache + dedupe:
  - in-memory maps for files/tree/preview
  - LRU caches for matrix blocks, line data, heatmap data, metadata
  - in-flight promise reuse for identical data requests
- Preview supports stale-while-refresh mode.

## 4) State and actions (`viewer_html/js/state`)

### `store.js`

Single mutable state object with:
- route/file selection
- tree caches and loading/errors
- metadata/preview state
- display config
- runtime flags
- compare mode state

Store API:
- `getState()`
- `setState()`
- `subscribe()`

### `reducers.js` and `reducers/*.js`

Action factories are merged into one `actions` object.

Main action groups:
- `filesActions`
  - file list load/refresh
  - open viewer / go home
- `treeActions`
  - lazy child loading
  - expand/collapse/select
  - breadcrumb path selection
- `viewActions`
  - inspect/display mode
  - tab switches
  - runtime toggle settings
  - full-view enable guards
- `displayConfigActions`
  - staged and applied dimension/fixed-index logic
  - debounced preview reload after apply
- `dataActions`
  - metadata/preview async fetch
  - stale-response guard before state update
  - preview request dedupe
- `compareActions`
  - line compare selection
  - dtype/shape/ndim validation

## 5) View orchestration (`viewer_html/js/views/viewerView.js`)

`viewerView.js` is the top-level orchestrator.

Responsibilities:
- render topbar/subbar/sidebar/panel regions
- keep statuses in sync
- bind delegated click/change handlers
- drive fullscreen button state
- drive export menu actions

Important export pattern:
- Runtime shell provides `shell.__exportApi`
- View calls `exportCsvDisplayed`, `exportCsvFull`, `exportPng` from that API

## 6) Components (`viewer_html/js/components`)

### `sidebarTree.js`

- Renders tree recursively from `childrenCache`
- Shows loading/error/retry states per path
- Handles select/toggle/retry events
- Shows line-compare add buttons only for compatible datasets

### `viewerPanel/render/*`

Pure HTML builders for:
- inspect panel
- display panel
- dimension controls
- preview content
- runtime shell placeholders (`data-*` attributes)

### `viewerPanel/runtime/bindEvents.js`

- Delegated event handling for panel controls
- Activates runtime engines for currently rendered shells
- Clears old runtime bindings before rebind

## 7) Runtime engines (`viewer_html/js/components/viewerPanel/runtime`)

### Matrix runtime (`matrixRuntime.js`)

- Virtualized grid rendering
- Block-based data fetching
- Bounded parallel block requests
- Reused DOM pools for visible cells
- Export:
  - displayed CSV (ensures needed blocks are loaded)
  - full CSV (backend URL export)

### Line runtime (`lineRuntime.js`)

- SVG chart rendering with:
  - wheel zoom
  - pan
  - click-zoom
  - keyboard navigation
- Debounced fetch for viewport changes
- Compare overlays for selected datasets
- Per-selection view cache (zoom/span/tool state)
- Export:
  - displayed CSV
  - full CSV
  - current PNG

### Heatmap runtime (`heatmapRuntime.js`)

- Canvas heatmap rendering
- Zoom/pan and hover/select
- Plot mode with linked inline line chart
- Progressive loading:
  - small preview first
  - high-resolution data second
- Selection/view caches for faster revisits
- Export:
  - displayed CSV
  - full CSV
  - current PNG

## 8) App bootstrap (`viewer_html/js/app-viewer.js`)

Startup flow:
1. Validate required modules and DOM IDs.
2. Subscribe render queue to state updates.
3. Wire responsive sidebar behavior.
4. Parse `?file=` deep link.
5. If deep link exists:
   - open viewer state
   - trigger file list load
6. If no deep link:
   - go home / blocked state
7. Render app.

## 9) Cleanup model

Runtimes register cleanup callbacks and remove:
- event listeners
- pending timers
- in-flight requests (via cancel keys)
- runtime export API hooks

This avoids memory leaks and stale handlers after rerenders.

## 10) Maintainer notes

- Because this app is plain-script based, script load order is critical.
- Keep `data-*` contracts stable between renderers and runtimes.
- When API payloads change, update:
  - `js/api/contracts.js`
  - runtime consumers
  - docs in `viewer_html/docs/`
