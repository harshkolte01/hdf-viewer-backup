# js/state/reducers

Each file in this folder exports an action factory: `create*Actions(deps)`.

All factories are composed together in `spa/js/state/reducers.js`.

## Files

### `utils.js`

Pure helper functions used by every action factory:
- path normalization
- ancestor path expansion
- display-dimension math
- fixed-index normalization
- query parameter serialization

### `filesActions.js`

What it does:
- loads the top-level file list
- opens the viewer for a selected file
- resets state back to home

Important SPA behavior:
- `openViewer({ key, etag })` resets viewer state
- then loads root tree children
- then loads root metadata so the sidebar is populated immediately

### `treeActions.js`

What it does:
- expands and collapses tree nodes
- selects the active HDF5 node
- handles breadcrumb navigation
- loads tree children lazily

Important SPA behavior:
- metadata is loaded for both groups and datasets
- preview is loaded only for datasets

### `viewActions.js`

What it does:
- handles sidebar visibility
- handles display tab changes
- handles display settings such as notation, line grid, and heatmap colormap
- enables full matrix, line, and heatmap runtimes

SPA note:
- `setViewMode()` is kept for compatibility
- the SPA shell keeps the main panel in `display` mode

### `displayConfigActions.js`

What it does:
- stages and applies display dimension changes for multidimensional datasets

### `dataActions.js`

What it does:
- fetches metadata and preview data
- guards against stale async responses overwriting newer state

Important SPA behavior:
- `loadMetadata()` is no longer inspect-mode-only
- metadata always drives the sidebar metadata panel

### `compareActions.js`

What it does:
- manages line compare selection state
- validates shape and dtype compatibility

Primary actions:
- `toggleLineCompare()`
- `addLineCompareDataset(item)`
- `removeLineCompareDataset(path)`
- `clearLineCompare()`
