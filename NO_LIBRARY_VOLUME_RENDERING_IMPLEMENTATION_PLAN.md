# No-Library 3D Volume Rendering Implementation Plan

## Goal

Implement true 3D dataset viewing in this repo without any external frontend library.

Constraints:

- use only plain `HTML`, `CSS`, and `JavaScript`
- keep the current `backend` + `viewer_html` stack
- stay production-oriented: responsive, scalable, and safe for large HDF5 datasets

Target behavior:

- 3D scalar datasets can be viewed as:
  - tri-planar slices (`XY`, `XZ`, `YZ`)
  - MIP volume rendering
  - later, full compositing volume rendering
- 4D and 5D datasets use the last 3 dims as the visible volume and keep the rest as fixed selectors
- current slice-view behavior for `matrix`, `line`, and `heatmap` remains intact

## Core Product Decision

For dense HDF5 arrays, treat the data as voxel volumes, not point clouds.

That means:

- `(Z, Y, X)` is a volume
- `(T, Z, Y, X)` is a time series of volumes
- `(A, T, Z, Y, X)` is a stack of volume series

Do not start with CPU-only 3D drawing in JavaScript. Use native `WebGL2` directly for real volume rendering.

## Recommended Delivery Order

Build this in three milestones:

1. tri-planar MPR viewer
2. WebGL2 MIP renderer
3. WebGL2 compositing renderer

Why this order:

- tri-planar is the fastest and safest useful 3D feature
- MIP is much simpler than full compositing and gives a real 3D view
- compositing needs more shader tuning, transfer-function work, and performance control

## Scope

### In scope

- backend support for extracting 3D volume blocks
- frontend `volume` tab in `viewer_html`
- no-library `WebGL2` renderer
- tri-planar linked slice viewer
- MIP rendering
- volume dims + fixed index selectors
- downsampling and ROI controls
- production safeguards for memory and rendering cost

### Out of scope for first pass

- isosurface extraction
- mesh generation
- arbitrary segmentation editing
- VR / AR
- distributed rendering
- server-side GPU rendering

## Current Repo Context

The repo already has a strong slice-view base:

- backend already normalizes multidimensional selection
- frontend already stores `displayDims` and `fixedIndices`
- frontend already has a responsive slice navigator
- matrix, line, and heatmap already follow a common selection contract

Main new gap:

- there is no 3D volume data contract
- there is no `volume` runtime
- there is no native WebGL renderer in `viewer_html`

## Selection Model

Keep the same idea as the slice-view implementation, but add a 3D visible-volume contract.

### Slice mode

- `display_dims = [rowDim, colDim]`
- `fixed_indices = { hiddenDim: index }`

### Volume mode

- `volume_dims = [depthDim, rowDim, colDim]`
- `fixed_indices = { hiddenDim: index }`

Defaults:

- for `ndim >= 3`, default visible volume dims are the last 3 dims
- examples:
  - `(Z, Y, X)` -> `[0, 1, 2]`
  - `(T, Z, Y, X)` -> `[1, 2, 3]`
  - `(A, T, Z, Y, X)` -> `[2, 3, 4]`

Hidden dims still use midpoint defaults unless the user selects a different index.

## Rendering Strategy

### Phase 1 renderer: Tri-planar MPR

Render three linked 2D planes:

- `XY`
- `XZ`
- `YZ`

Controls:

- crosshair / slice index per axis
- pan / zoom per panel
- linked cursor
- optional intensity readout at the current voxel

This should work even if full volume rendering is temporarily disabled.

### Phase 2 renderer: MIP

Use `WebGL2` fragment-shader ray marching:

- upload the volume as a `TEXTURE_3D`
- render a cube proxy
- march rays through the volume
- keep the maximum sampled intensity along the ray

This is the best first true 3D renderer for this stack because it is simpler and easier to debug than compositing.

### Phase 3 renderer: Composite

Extend the same ray-marching pipeline:

- sample the volume
- apply transfer function
- accumulate color and opacity front-to-back
- stop early when opacity reaches threshold

This should reuse the same texture upload, camera, and bounds logic as MIP.

## Backend Design

### New endpoint

Add a dedicated volume data endpoint instead of trying to overload the current 2D preview/data response shape.

Recommended shape:

- `GET /files/{file}/volume`

Query parameters:

- `path`
- `volume_dims=1,2,3`
- `fixed_indices=0:5,4:1`
- `downsample=1|2|4|8`
- `roi=z0:z1,y0:y1,x0:x1`
- `dtype=uint8|uint16|float32`
- `normalize=minmax|none`
- `etag`

Response:

- metadata headers or JSON sidecar:
  - `shape`
  - `dtype`
  - `volume_dims`
  - `fixed_indices`
  - `min`
  - `max`
  - `downsample`
  - `roi`
- binary payload:
  - `application/octet-stream`
  - packed voxels in depth-major order

### Why a dedicated endpoint is better

- avoids mixing 2D preview contracts with 3D payloads
- keeps binary transfer efficient
- makes caching and request keys explicit
- lets the backend reject oversized requests cleanly

## Frontend Design

### New viewer tab

Add a new display tab:

- `volume`

Tab behavior:

- visible only for datasets with `ndim >= 3`
- default to tri-planar on first open
- allow switching between:
  - `mpr`
  - `mip`
  - later `composite`

### New state

Add a new volume config in store/reducers:

- `volumeDims`
- `stagedVolumeDims`
- `volumeFixedIndices`
- `volumeRenderMode`
- `volumeDownsample`
- `volumeRoi`
- `volumeWindow`
- `volumeTransferPreset`
- `volumeRequestKey`
- `volumeRequestInFlight`

The hidden-dimension model should remain consistent with existing slice controls.

## WebGL2 Runtime Design

### New modules

Add new files in `viewer_html`:

- `viewer_html/js/components/viewerPanel/runtime/volumeRuntime.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeGl.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeShaders.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeCamera.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeTransfer.js`

Optional render helpers:

- `viewer_html/js/components/viewerPanel/render/volumeControls.js`
- `viewer_html/js/components/viewerPanel/render/volumeSection.js`

### WebGL2 pipeline

1. create WebGL2 context
2. validate `TEXTURE_3D` support
3. create 3D texture from backend payload
4. upload transfer function texture
5. build cube geometry
6. compute ray origin and direction in shader
7. intersect ray with volume bounds
8. march through volume
9. output either:
   - MIP intensity
   - composite color/opacity

### Camera and interaction

Plain JS camera controls:

- orbit
- pan
- zoom
- reset view

Prefer a simple trackball/orbit implementation, not a full scene graph.

## Performance Rules

These are mandatory for production readiness.

### Payload limits

Never load full-resolution large volumes by default.

Start with caps like:

- `128^3` for safe initial render
- `256^3` only on demand

Block or downsample larger requests server-side.

### Dtype strategy

Prefer:

- `uint8` for first pass rendering
- `uint16` for higher-fidelity scientific mode

Avoid defaulting to `float32` browser uploads for large volumes unless strictly required.

### Memory strategy

Keep only one active high-resolution volume texture per viewer instance.

When selection changes:

- cancel in-flight requests
- destroy stale textures
- reuse GPU objects when possible

### Interaction strategy

Do not re-fetch the volume for:

- camera changes
- transfer-function changes
- window/level changes

Those should be GPU-side only.

Only re-fetch when:

- selected dataset changes
- `volume_dims` change
- `fixed_indices` change
- ROI changes
- downsample changes

## Step-by-Step Implementation Plan

### Phase 0: Repo Preparation

Objective:
Create a stable base for 3D work without breaking the current 2D viewer.

Steps:

1. Audit current viewer render pipeline and event binding.
2. Confirm where a new `volume` tab fits in the existing display toolbar.
3. Add sample 3D, 4D, and 5D datasets for manual validation.
4. Define a browser capability check for `WebGL2`.

Files:

- `viewer_html/js/views/viewerView.js`
- `viewer_html/js/state/store.js`
- `backend/tests`

Done when:

- the app can cleanly show or hide a `volume` tab
- unsupported browsers fail gracefully

### Phase 1: Add the Volume Selection Contract

Objective:
Add backend/frontend parity for `volume_dims` and hidden-dimension selection.

Steps:

1. Add backend normalization for `volume_dims`.
2. Keep `fixed_indices` semantics identical to slice mode.
3. Default to last 3 dims for `ndim >= 3`.
4. Add frontend helpers mirroring backend defaults.
5. Keep staged/applied behavior for volume dims where useful.

Files:

- `backend/src/utils/selection.py`
- `backend/src/routes/hdf5.py`
- `backend/src/readers/hdf5_reader.py`
- `viewer_html/js/state/reducers/utils.js`
- `viewer_html/js/components/viewerPanel/shared.js`

Done when:

- frontend and backend agree on implied `volume_dims`
- invalid `volume_dims` fail predictably

### Phase 2: Implement Volume Endpoint

Objective:
Serve 3D voxel blocks efficiently.

Steps:

1. Add `/volume` route.
2. Extract 3D block using `volume_dims` + `fixed_indices`.
3. Add optional downsampling.
4. Add optional ROI cropping.
5. Add dtype conversion and normalization options.
6. Return metadata and binary payload.
7. Add request limits to avoid excessive memory usage.

Files:

- `backend/src/routes/hdf5.py`
- `backend/src/readers/hdf5_reader.py`
- `backend/src/utils/selection.py`
- `backend/tests/test_hdf5_routes.py`

Done when:

- 3D volume payloads can be fetched reliably
- oversized requests fail with controlled errors

### Phase 3: Add Tri-Planar Viewer

Objective:
Ship the first useful 3D visualization mode quickly.

Steps:

1. Add `volume` tab and `mpr` render mode.
2. Render three linked slice panels.
3. Add crosshair state for `x`, `y`, `z`.
4. Add zoom/pan per plane.
5. Add synchronized cursor and voxel readout.
6. Reuse current hidden-dim controls for 4D/5D parents.

Files:

- `viewer_html/js/views/viewerView.js`
- `viewer_html/js/components/viewerPanel/render/sections.js`
- `viewer_html/js/components/viewerPanel/render/dimensionControls.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeRuntime.js`
- `viewer_html/css/viewer-panel.css`

Done when:

- a `(Z, Y, X)` dataset shows linked `XY`, `XZ`, and `YZ`
- moving a crosshair updates all three planes correctly

### Phase 4: Add WebGL2 MIP Renderer

Objective:
Introduce the first real 3D view.

Steps:

1. Initialize WebGL2 canvas runtime.
2. Upload 3D texture from backend payload.
3. Add cube proxy render path.
4. Implement MIP fragment shader.
5. Add orbit/pan/zoom camera.
6. Add reset and quality controls.
7. Add fallback to tri-planar if WebGL2 is unavailable.

Files:

- `viewer_html/js/components/viewerPanel/runtime/volumeRuntime.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeGl.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeShaders.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeCamera.js`
- `viewer_html/css/viewer-panel.css`

Done when:

- users can rotate a 3D volume interactively
- MIP stays responsive at the chosen capped volume sizes

### Phase 5: Add Composite Renderer

Objective:
Support proper opacity-based volume rendering.

Steps:

1. Add transfer function texture support.
2. Add front-to-back compositing shader.
3. Add opacity and window controls.
4. Add transfer presets for common scientific ranges.
5. Add early ray termination and step-size controls.

Files:

- `viewer_html/js/components/viewerPanel/runtime/volumeShaders.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeTransfer.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeRuntime.js`
- `viewer_html/css/viewer-panel.css`

Done when:

- users can switch between `MIP` and `Composite`
- opacity/color updates happen without re-fetching the volume

### Phase 6: Performance Hardening

Objective:
Make the feature safe for real-world datasets.

Steps:

1. Add request cancellation for stale volume loads.
2. Add texture disposal on selection changes.
3. Add downsample presets and request caps.
4. Add low-quality while interacting, high-quality when idle.
5. Add ROI crop mode to reduce payload size.
6. Add explicit memory and payload warnings in UI.

Files:

- `viewer_html/js/state/reducers/dataActions.js`
- `viewer_html/js/components/viewerPanel/runtime/volumeRuntime.js`
- `backend/src/routes/hdf5.py`
- `backend/src/readers/hdf5_reader.py`

Done when:

- stale requests do not overwrite current state
- the viewer remains responsive during camera motion

### Phase 7: Testing and Verification

Objective:
Lock the behavior before wider rollout.

Steps:

1. Add backend tests for:
   - default `volume_dims`
   - custom `volume_dims`
   - invalid duplicate dims
   - invalid out-of-range dims
   - ROI and downsample handling
2. Add frontend smoke tests for:
   - volume tab visibility
   - tri-planar crosshair sync
   - MIP load/unload
   - fallback when WebGL2 is unavailable
3. Add manual QA checklist on desktop and mobile layouts.

Files:

- `backend/tests/test_hdf5_routes.py`
- `backend/tests/test_selection_utils.py`
- `viewer_html`

Done when:

- volume requests and rendering flows are covered by repeatable checks

## File-Level TODO

### Backend

- [ ] extend selection normalization to support `volume_dims`
- [ ] add dedicated `/volume` endpoint
- [ ] add binary volume response path
- [ ] add downsample support
- [ ] add ROI support
- [ ] add dtype conversion and normalization controls
- [ ] add size limits and controlled error responses
- [ ] add backend tests for 3D/4D/5D volume selection

### Frontend State

- [ ] add `volume` tab state
- [ ] add `volumeDims` and staged state
- [ ] add volume request key management
- [ ] add volume loading/error state
- [ ] add WebGL2 capability detection

### Frontend UI

- [ ] add `volume` display tab
- [ ] add volume mode selector: `mpr`, `mip`, `composite`
- [ ] add 3D dim selectors
- [ ] add hidden-dim controls for higher-dimensional parents
- [ ] add downsample and ROI controls
- [ ] add window/level and transfer-function controls
- [ ] make the layout responsive for desktop and tablet

### Frontend Runtime

- [ ] create `volumeRuntime.js`
- [ ] create `volumeGl.js`
- [ ] create `volumeShaders.js`
- [ ] create `volumeCamera.js`
- [ ] create `volumeTransfer.js`
- [ ] implement tri-planar rendering
- [ ] implement MIP rendering
- [ ] implement compositing rendering
- [ ] implement texture cleanup and stale-request protection

### Verification

- [ ] verify `(Z,Y,X)` default volume dims are `[0,1,2]`
- [ ] verify `(T,Z,Y,X)` default volume dims are `[1,2,3]`
- [ ] verify hidden dims remain selectable
- [ ] verify MPR and MIP use the same fixed selection
- [ ] verify volume payload limits prevent browser lockups
- [ ] verify mobile layout degrades gracefully
- [ ] verify unsupported browsers fall back cleanly

## Acceptance Criteria

- a 3D dataset can open in a `volume` tab without breaking existing slice modes
- tri-planar view works before full WebGL volume rendering is enabled
- WebGL2 MIP rendering is interactive for capped volume sizes
- 4D and 5D datasets can select a 3D volume plus fixed hidden dims
- stale volume requests do not overwrite the current dataset view
- the feature fails predictably on unsupported browsers or oversized requests

## Final Recommendation

Do not start with full compositing first.

Ship in this order:

1. volume selection contract
2. backend volume endpoint
3. tri-planar MPR
4. WebGL2 MIP
5. compositing

That is the lowest-risk path to a production-ready no-library 3D viewer in this repo.
