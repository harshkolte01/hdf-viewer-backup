# js/components/viewerPanel/render

Pure rendering functions that turn state into HTML strings.

No DOM mutation happens here. These modules are called on every render and return deterministic markup for the SPA shell.

## Files

### `config.js`

What it does:
- resolves display configuration for line, heatmap, and matrix views
- builds stable selection keys used by runtimes and caches

### `dimensionControls.js`

What it does:
- renders the dimension controls shown beside eligible datasets in the main panel
- lets the user choose display axes and, when enabled, fixed indices

### `previews.js`

What it does:
- renders lightweight preview content before the full runtime is enabled
- supports table, line, and heatmap previews

### `sections.js`

What it does:
- builds the full display markup for the main panel
- builds the shared metadata markup reused by the SPA sidebar metadata panel

Important functions:
- `renderDisplayContent(state)` - main panel display layout
- `renderMetadataPanelContent(state, options)` - metadata cards and raw JSON block
- `renderVirtualLineShell(...)` - line runtime shell
- `renderVirtualHeatmapShell(...)` - heatmap runtime shell
- `renderVirtualMatrixShell(...)` - matrix runtime shell

SPA note:
- `renderInspectContent(state)` now exists mainly as a compatibility alias around the shared metadata renderer
- the SPA shell does not use a visible inspect tab
