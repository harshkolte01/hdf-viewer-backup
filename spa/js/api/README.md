# js/api

The `api/` layer handles communication between the SPA viewer and the backend HDF5 API.

It is responsible for:
- making HTTP requests
- normalizing backend payloads
- caching results so repeated navigation and redraws do not refetch unnecessarily

## Files

### `client.js`

What it does:
- wraps `fetch`
- supports aborting and cancel-key-based request replacement
- normalizes failures into a consistent `ApiError`

### `contracts.js`

What it does:
- converts raw backend payloads into predictable frontend shapes
- gives reducers and renderers stable field types

Important normalizers:
- `normalizeFilesResponse(...)`
- `normalizeTreeChildrenResponse(...)`
- `normalizeFileMetaResponse(...)`
- `normalizeFilePreviewResponse(...)`
- `normalizeDataResponse(...)`

### `hdf5Service.js`

What it does:
- main API facade used by state actions
- adds frontend caching, in-flight deduplication, and stale-while-refresh behavior

Important functions:
- `getFiles()`
- `refreshFiles()`
- `getFileChildren(fileKey, path, options)`
- `getFileMeta(fileKey, path, options)`
- `getFilePreview(fileKey, path, params, options)`

## SPA Notes

- Metadata fetched through `getFileMeta()` now feeds the sidebar metadata panel.
- Preview data fetched through `getFilePreview()` drives the main display-only panel.
- Backend contracts are unchanged by the SPA shell changes.
