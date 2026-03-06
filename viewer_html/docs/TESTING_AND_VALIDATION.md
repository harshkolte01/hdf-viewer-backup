# Testing And Validation

Validation checklist for `viewer_html/`.

This frontend currently relies mostly on manual validation (no dedicated automated test suite in this folder).

## 1) Preconditions

- Backend running and reachable at configured `API_BASE_URL` (default `http://localhost:5000`).
- At least one valid HDF5 object key to open using `?file=`.

## 2) Basic boot checks

- Open `index.html` through a static server.
- Confirm no module dependency errors in console.
- Confirm global status is not blocked once `?file=` is provided.

## 3) Tree checks

- Root tree node loads with children.
- Expanding groups loads lazy children.
- Retry button works on simulated error.
- Breadcrumb clicks navigate and keep tree state consistent.

## 4) Inspect mode checks

- Selecting group shows metadata.
- Selecting dataset shows metadata.
- JSON block is visible and updates when selection changes.

## 5) Display preview checks

- Switching to display mode triggers preview load.
- Tabs switch correctly:
  - matrix
  - line
  - heatmap (only when dataset supports it)
- Dimension controls update staged config.
- Apply triggers preview reload.

## 6) Full runtime checks

## Matrix runtime

- Click `Load full view`.
- Scroll horizontally and vertically.
- New blocks stream in and values render.
- `CSV (Displayed)` export works for visible window.

## Line runtime

- Click `Load full line`.
- Wheel zoom works.
- Hand pan mode works.
- Start/Prev/Next/End controls work.
- Compare mode adds compatible datasets.
- `CSV (Displayed)`, `CSV (Full)`, and `PNG (Current View)` work.

## Heatmap runtime

- Click `Load high-res`.
- Preview appears first, then high-res updates.
- Wheel zoom and hand pan work.
- Plot mode opens linked line panel.
- `CSV (Displayed)`, `CSV (Full)`, and `PNG (Current View)` work.

## 7) Error handling checks

- Stop backend and verify clear error status appears.
- Restore backend and verify actions work again.
- Trigger quick tab/path switching and confirm stale responses do not overwrite active selection.

## 8) Mobile/responsive checks

- View width below `1024px`.
- Sidebar opens/closes correctly.
- Line full view still allows chart interactions.

## 9) Regression checks after changes

Always re-check:
- `index.html` script order
- `data-*` attributes used between render and runtime modules
- export menu behavior in `viewerView.js`
- cleanup behavior when switching datasets/tabs repeatedly

## 10) Optional syntax check

If Node.js is available:

```bash
node --check viewer_html/js/api/hdf5Service.js
node --check viewer_html/js/state/reducers/dataActions.js
node --check viewer_html/js/components/viewerPanel/runtime/matrixRuntime.js
node --check viewer_html/js/components/viewerPanel/runtime/lineRuntime.js
node --check viewer_html/js/components/viewerPanel/runtime/heatmapRuntime.js
```
