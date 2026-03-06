# File Map

File ownership map for `viewer_html/`.

## Root files

- `viewer_html/index.html`
  - static shell and script load order.

- `viewer_html/README.md`
  - frontend overview and quick start.

- `viewer_html/PLAN.md`
  - planning notes/history for the frontend.

## Runtime config

- `viewer_html/config/runtime-config.js`
  - boot-time runtime config (`window.__CONFIG__`).

- `viewer_html/js/core/config.js`
  - normalizes API base and endpoint builders.

## Core runtime

- `viewer_html/js/core/namespace.js`
  - module namespace and dependency helpers.

- `viewer_html/js/core/domRefs.js`
  - required shell ID contract + DOM helpers.

## App bootstrap and view

- `viewer_html/js/app-viewer.js`
  - startup lifecycle and deep-link handling.

- `viewer_html/js/views/viewerView.js`
  - shell rendering, event delegation, export menu routing.

## API layer

- `viewer_html/js/api/client.js`
  - fetch wrapper, cancellation, normalized errors.

- `viewer_html/js/api/contracts.js`
  - backend payload normalization.

- `viewer_html/js/api/hdf5Service.js`
  - frontend service API with caches and request dedupe.

## State layer

- `viewer_html/js/state/store.js`
  - global mutable state and subscriptions.

- `viewer_html/js/state/reducers.js`
  - composes action factories.

- `viewer_html/js/state/reducers/filesActions.js`
  - file list load/refresh + open/go-home actions.

- `viewer_html/js/state/reducers/treeActions.js`
  - tree expand/select/lazy-load behavior.

- `viewer_html/js/state/reducers/viewActions.js`
  - view mode/tab/settings/full-view toggles.

- `viewer_html/js/state/reducers/displayConfigActions.js`
  - staged/applied display dims and fixed indices.

- `viewer_html/js/state/reducers/dataActions.js`
  - metadata/preview async loading with stale guards.

- `viewer_html/js/state/reducers/compareActions.js`
  - line compare selection and compatibility checks.

- `viewer_html/js/state/reducers/utils.js`
  - reducer helper math and normalization.

## Component layer

- `viewer_html/js/components/sidebarTree.js`
  - tree HTML + delegated tree events.

- `viewer_html/js/components/viewerPanel.js`
  - stable facade for panel render/bind.

## Panel render layer

- `viewer_html/js/components/viewerPanel/render.js`
  - display vs inspect wrapper.

- `viewer_html/js/components/viewerPanel/render/config.js`
  - runtime config derivation from state/preview.

- `viewer_html/js/components/viewerPanel/render/dimensionControls.js`
  - controls for display dims and fixed indices.

- `viewer_html/js/components/viewerPanel/render/previews.js`
  - preview rendering for matrix/line/heatmap.

- `viewer_html/js/components/viewerPanel/render/sections.js`
  - section markup and runtime shell templates.

## Panel runtime layer

- `viewer_html/js/components/viewerPanel/runtime/common.js`
  - shared cleanup helpers.

- `viewer_html/js/components/viewerPanel/runtime/bindEvents.js`
  - delegated panel interactions + runtime activation.

- `viewer_html/js/components/viewerPanel/runtime/matrixRuntime.js`
  - virtualized matrix engine.

- `viewer_html/js/components/viewerPanel/runtime/lineRuntime.js`
  - line chart engine (zoom/pan/compare/export).

- `viewer_html/js/components/viewerPanel/runtime/heatmapRuntime.js`
  - heatmap engine (canvas/plot mode/export).

## Shared panel helpers

- `viewer_html/js/components/viewerPanel/shared.js`
  - constants and shared display utility helpers.

## Utilities

- `viewer_html/js/utils/format.js`
  - escaping and size formatting.

- `viewer_html/js/utils/lru.js`
  - LRU cache implementation.

- `viewer_html/js/utils/export.js`
  - CSV/PNG export helper functions.

## Styling and assets

- `viewer_html/css/*.css`
  - shell, panel, and component styles.

- `viewer_html/css/components/*.css`
  - tree/table/chart component styles.

- `viewer_html/assets/logo.svg`
  - branding asset.

## Documentation

- `viewer_html/docs/README.md`
- `viewer_html/docs/VIEWER_HTML.md`
- `viewer_html/docs/VIEWER_HTML_IMPLEMENTATION.md`
- `viewer_html/docs/API_REFERENCE.md`
- `viewer_html/docs/FILE_MAP.md`
- `viewer_html/docs/OPERATIONS_AND_RUNBOOK.md`
- `viewer_html/docs/TESTING_AND_VALIDATION.md`
