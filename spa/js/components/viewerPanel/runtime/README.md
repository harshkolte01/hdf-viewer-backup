# js/components/viewerPanel/runtime

Interactive runtime engines for the SPA main display panel.

`render/` creates HTML shells. `runtime/` attaches behavior, streams data, and manages cleanup.

## Files

### `common.js`

What it does:
- holds cleanup registries for active runtimes
- exposes shared runtime utilities

### `bindEvents.js`

What it does:
- central coordinator called after each render
- binds delegated panel controls
- finds fresh matrix, line, and heatmap shell nodes
- initializes the matching runtime engine

### `matrixRuntime.js`

What it does:
- virtualized matrix viewer for large 2D datasets
- streams only visible blocks

### `lineRuntime.js`

What it does:
- interactive SVG line chart
- supports zoom, pan, compare overlays, fullscreen, and export

### `heatmapRuntime.js`

What it does:
- interactive canvas heatmap
- supports zoom, pan, plot mode, colormap changes, and export

## SPA Note

- These runtimes now serve only the main display panel.
- Metadata is not rendered here; it is handled separately by the sidebar metadata panel.
