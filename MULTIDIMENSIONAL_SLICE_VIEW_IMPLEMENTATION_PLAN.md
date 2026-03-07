# Multidimensional Slice View Implementation Plan

## Goal
Implement proper multidimensional dataset viewing for HDF5 arrays in the active stack:

- `backend` for dataset selection and data delivery
- `viewer_html` for slice controls and rendering

Target behavior:

- 2 dimensions are rendered on screen
- all remaining dimensions are controlled through fixed-index selectors/sliders
- defaults follow the scientific expectation:
  - `(Z, Y, X)` -> show `(Y, X)`, control `Z`
  - `(T, Z, Y, X)` -> show `(Y, X)`, control `T` and `Z`
  - `(A, T, Z, Y, X)` -> show `(Y, X)`, control `A`, `T`, and `Z`

## Scope

### In scope for first implementation

- robust ND slice viewing for `matrix`, `line`, and `heatmap`
- UI for hidden-dimension sliders / index controls
- stable default axis selection
- better labels and UX for 3D/4D/5D datasets
- backend/frontend validation parity
- tests for ND selection behavior

### Explicitly out of scope for first implementation

- true 3D volume rendering
- WebGL volume rendering
- voxel ray-marching or transparent volume compositing
- a new backend endpoint dedicated to volume rendering

Volume rendering can be planned later as a separate feature after slice view is complete and stable.

## Current State Summary

The repo already has the core slice-selection model:

- backend accepts `display_dims` and `fixed_indices`
- backend builds a full N-D indexer using 2 visible dims plus fixed indices for the rest
- viewer state already stores `displayDims` and `fixedIndices`
- viewer already sends those values in preview and data requests

Main gaps:

- frontend default dims are not aligned with the backend default
- fixed-index controls exist in the viewer but are effectively disabled
- ND UX is still generic and not presented as a clear "slice navigator"
- tests do not yet cover the full expected 3D/4D/5D user flows

## Core Product Decision

Treat this as a slice-view feature, not a volume-rendering feature.

One selection model should drive everything:

- `display_dims = [rowDim, colDim]`
- `fixed_indices = { hiddenDim: selectedIndex }`

That model should be the single source of truth for:

- preview requests
- matrix runtime requests
- line runtime requests
- heatmap runtime requests
- CSV export requests

## Acceptance Criteria

- 3D datasets open with `(Y, X)` visible by default and `Z` selectable
- 4D datasets open with `(Y, X)` visible by default and `T`, `Z` selectable
- 5D datasets open with `(Y, X)` visible by default and all non-visible dims selectable
- changing a slider updates preview and full views correctly
- matrix, line, and heatmap all respect the same slice selection
- export respects the active slice selection
- invalid dims / invalid fixed indices fail predictably
- tests cover the core ND selection flows

## Step-by-Step Implementation Plan

### Phase 1: Align the selection model

Objective:
Make backend and frontend use the same mental model and defaults.

Steps:

1. Confirm that the canonical default visible dims are always the last two dims for `ndim >= 2`.
2. Update viewer helper defaults to match backend defaults.
3. Keep `display_dims` and `fixed_indices` as the only selection contract.
4. Do not introduce alternate query formats or feature-specific selection state.

Files:

- `backend/src/routes/hdf5.py`
- `backend/src/readers/hdf5_reader.py`
- `viewer_html/js/state/reducers/utils.js`
- `viewer_html/js/components/viewerPanel/shared.js`

Done when:

- a 3D dataset defaults to `(1,2)` rather than `(0,1)`
- frontend and backend produce identical implied selections when no custom selection is provided

### Phase 2: Turn hidden dims into real slice controls

Objective:
Expose the existing fixed-index mechanism as user-facing slice navigation.

Steps:

1. Replace the hidden/disabled fixed-index block with active controls.
2. Show one slider + numeric input for every hidden dimension.
3. Label each hidden dimension clearly:
   - `Dim 0`, `Dim 1`, etc. in the first pass
   - optionally add semantic aliases like `Z`, `T`, `A` later when useful
4. Display current index and max index beside each slider.
5. Keep axis selectors for advanced users who want to swap visible planes.
6. Preserve staged/applied selection logic only where it improves UX.
7. For slider moves, prefer debounced auto-apply rather than forcing the user to click `Set` repeatedly.
8. Keep `Set` / `Reset` only for dim-plane changes if needed.

Files:

- `viewer_html/js/components/viewerPanel/render/dimensionControls.js`
- `viewer_html/js/components/viewerPanel/runtime/bindEvents.js`
- `viewer_html/js/state/reducers/displayConfigActions.js`
- `viewer_html/css/viewer-panel.css`
- `viewer_html/css/components/charts.css`

Done when:

- 3D datasets visibly show one slice slider
- 4D datasets visibly show two slice sliders
- moving a slider updates the selected hidden-dimension index and reloads preview safely

### Phase 3: Make previews feel like slice previews

Objective:
Ensure preview content clearly reflects the active slice selection.

Steps:

1. Show active slice info in the preview sidebar or panel header.
2. Include active hidden-dimension values in the preview summary.
3. Keep preview mode switching intact for `table`, `line`, and `heatmap`.
4. Ensure preview reloads use the current `display_dims` and `fixed_indices`.
5. Ensure cache keys remain tied to the full slice selection.

Files:

- `viewer_html/js/state/reducers/dataActions.js`
- `viewer_html/js/api/hdf5Service.js`
- `viewer_html/js/components/viewerPanel/render/sections.js`
- `viewer_html/js/components/viewerPanel/render/previews.js`

Done when:

- preview data changes immediately when the slice changes
- cached preview reuse does not leak stale slice data across selections

### Phase 4: Ensure full runtimes follow the same slice selection

Objective:
Make matrix, line, and heatmap full views behave consistently with the preview.

Steps:

1. Verify matrix runtime requests always include current `display_dims` and `fixed_indices`.
2. Verify heatmap runtime requests always include current `display_dims` and `fixed_indices`.
3. Verify line runtime requests always include current `display_dims` and `fixed_indices`.
4. Make the line runtime clearly indicate which row/column or profile is being sampled.
5. Reset incompatible full-view state when the selected plane changes.
6. Keep cache keys and runtime selection keys tied to the full slice selection.

Files:

- `viewer_html/js/components/viewerPanel/render/config.js`
- `viewer_html/js/components/viewerPanel/runtime/matrixRuntime.js`
- `viewer_html/js/components/viewerPanel/runtime/lineRuntime.js`
- `viewer_html/js/components/viewerPanel/runtime/heatmapRuntime.js`
- `viewer_html/js/state/reducers/viewActions.js`

Done when:

- full matrix view follows the selected slice
- full heatmap view follows the selected slice
- full line view follows the selected slice
- no stale full-view render survives a slice change

### Phase 5: Improve 3D usability with plane presets

Objective:
Make 3D navigation easier than generic dim juggling.

Steps:

1. Add optional plane presets for 3D datasets:
   - `XY`
   - `XZ`
   - `YZ`
2. Map those presets to `display_dims` while leaving the remaining dim as a slider.
3. Keep generic dim selectors for all ND cases.
4. Do not hardcode plane presets for every higher-dimensional shape in the first pass.

Files:

- `viewer_html/js/components/viewerPanel/render/dimensionControls.js`
- `viewer_html/js/state/reducers/displayConfigActions.js`
- `viewer_html/css/viewer-panel.css`

Done when:

- a user can switch between `XY`, `XZ`, and `YZ` quickly for 3D data

### Phase 6: Tighten backend validation and behavior parity

Objective:
Make preview/data/export all interpret selection identically.

Steps:

1. Audit default dim behavior between route layer and reader layer.
2. Ensure preview and data use equivalent selection normalization rules.
3. Keep negative fixed-index normalization consistent where supported.
4. Ensure invalid `display_dims` and invalid `fixed_indices` return controlled errors.
5. Ensure exports use the exact active slice selection.
6. Avoid introducing separate slice logic per mode.

Files:

- `backend/src/routes/hdf5.py`
- `backend/src/readers/hdf5_reader.py`
- `backend/tests/test_hdf5_routes.py`

Done when:

- preview, data, and export all agree on the selected slice
- selection edge cases are covered by backend tests

### Phase 7: Add explicit test coverage

Objective:
Lock behavior before further feature work.

Steps:

1. Add backend tests for:
   - `(Z, Y, X)` default selection
   - `(T, Z, Y, X)` default selection
   - custom `display_dims`
   - custom `fixed_indices`
   - negative fixed index normalization
   - invalid duplicate dims
2. Add frontend/manual verification checklist for:
   - 3D slider changes
   - 4D double-slider changes
   - axis swaps
   - line/matrix/heatmap consistency
   - export correctness
3. If practical, add lightweight state/action tests for display config reducers.

Files:

- `backend/tests/test_hdf5_routes.py`
- `viewer_html/docs/TESTING_AND_VALIDATION.md`

Done when:

- regressions in ND slice selection are easy to catch

### Phase 8: Documentation and rollout

Objective:
Document the feature clearly for future work.

Steps:

1. Update viewer docs to explain slice selection for ND datasets.
2. Update backend API docs to explicitly describe last-two-dims default behavior.
3. Document that true volume rendering is not part of this phase.
4. Record future extension ideas separately so they do not leak into the first implementation.

Files:

- `viewer_html/docs/API_REFERENCE.md`
- `viewer_html/docs/VIEWER_HTML_IMPLEMENTATION.md`
- `backend/docs/API_REFERENCE.md`
- `backend/docs/BACKEND_IMPLEMENTATION.md`

Done when:

- another developer can understand the feature without reverse-engineering the code

## Detailed TODO Checklist

### Backend TODO

- [ ] Standardize default visible dims to "last two dims" everywhere in the backend flow.
- [ ] Ensure preview normalization and data normalization use the same selection rules.
- [ ] Verify export routes respect the same `display_dims` and `fixed_indices`.
- [ ] Add tests for 3D, 4D, and 5D selection defaults.
- [ ] Add tests for invalid duplicated dims and out-of-range fixed indices.
- [ ] Add tests for negative fixed-index normalization.

### Viewer State / Actions TODO

- [ ] Change frontend default visible dims to match backend defaults.
- [ ] Decide where auto-apply is used versus staged apply.
- [ ] Add debounced reload for slider-driven slice changes.
- [ ] Reset full-view flags when the slice/plane changes in incompatible ways.
- [ ] Keep preview request keys and runtime selection keys slice-aware.

### Viewer UI TODO

- [ ] Enable hidden-dimension controls in the sidebar.
- [ ] Add one slider and one numeric field for each hidden dimension.
- [ ] Show active slice summary in the UI.
- [ ] Improve labels so users understand which dims are visible and which are fixed.
- [ ] Add plane presets for 3D datasets.
- [ ] Keep generic dimension selectors for ND datasets.

### Runtime TODO

- [ ] Verify matrix runtime follows active slice state.
- [ ] Verify heatmap runtime follows active slice state.
- [ ] Verify line runtime follows active slice state.
- [ ] Make line runtime labeling clearer for row/column/profile selection.
- [ ] Verify displayed export uses active slice selection.
- [ ] Verify full CSV export uses active slice selection.

### Testing TODO

- [ ] Prepare sample HDF5 fixtures for 3D, 4D, and 5D datasets.
- [ ] Test `(Z, Y, X)` with default plane and custom plane swaps.
- [ ] Test `(T, Z, Y, X)` with independent slider movement.
- [ ] Test `(A, T, Z, Y, X)` with multiple hidden-dim combinations.
- [ ] Test rapid slider movement for stale-request safety.
- [ ] Test export after slice changes.

## Suggested Implementation Order

1. Fix frontend default dim selection.
2. Enable hidden-dimension controls in the viewer.
3. Add debounced auto-apply for slice sliders.
4. Verify preview behavior.
5. Verify full matrix / line / heatmap behavior.
6. Add 3D plane presets.
7. Add backend test coverage.
8. Update docs.

## Risks

- frontend and backend defaults drifting apart again
- stale async preview/data responses after rapid slider changes
- line runtime behaving differently from matrix/heatmap for ND datasets
- export paths ignoring the active slice state
- trying to fold true volume rendering into this phase and overcomplicating delivery

## Future Phase: Optional Volume Rendering

Only start this after the slice-view feature is complete.

Future work could include:

- a dedicated `Volume` tab in `viewer_html`
- sampled 3D payload contracts from `backend`
- a WebGL-based renderer
- transfer functions, thresholding, and opacity controls
- tri-planar + volume hybrid mode

This should be planned as a separate feature, not mixed into the first ND slice implementation.
