# js/components/viewerPanel

Code for the main display area of the SPA viewer.

This folder is split into two layers:
- `render/` - pure HTML string generation from state
- `runtime/` - imperative behavior for matrix, line, and heatmap shells

## Files At This Level

### `shared.js`

What it does:
- defines shared constants and helper functions used by both render and runtime layers
- centralizes shape, dimension, cache, and formatting helpers for panel code

### `render.js`

What it does:
- top-level main-panel renderer for the SPA shell
- always renders display content in this SPA copy

SPA note:
- metadata no longer lives in the main panel
- the shared metadata renderer is still kept in `render/sections.js` because the sidebar reuses it

### `runtime.js`

What it does:
- facade for `bindViewerPanelEvents`
- preserves a stable runtime binding entry point for the rest of the shell

## Two-Phase Model

```text
Phase 1 - Render
  renderViewerPanel(state)
    -> build display HTML
    -> inject preview or runtime shell nodes

Phase 2 - Bind
  bindViewerPanelEvents(root, actions)
    -> bind delegated panel events
    -> initialize matrix / line / heatmap runtimes
```

See [render/README.md](render/README.md) and [runtime/README.md](runtime/README.md).
