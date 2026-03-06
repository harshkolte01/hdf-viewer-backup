# H5API Implementation Walkthrough

This document explains how H5API works in source-code order.

## 1) App bootstrap (`H5API/app.py`)

Startup flow:
- `.env` is loaded from the H5API directory.
- logging is configured.
- Flask app is created.
- CORS is enabled for `/api/*` endpoints.

Defined routes:
- `GET /` -> render `templates/index.html`
- `GET /api/browse` -> return folder/file listing JSON
- `GET /health` -> liveness payload

## 2) Storage root resolution

Function: `_resolve_storage_root()`

Resolution logic:
1. include `STORAGE_ROOT` first if set
2. add OS-priority fallbacks
   - Windows: `STORAGE_PATH_WINDOWS`, then `STORAGE_PATH_LINUX`
   - Linux/macOS: `STORAGE_PATH_LINUX`, then `STORAGE_PATH_WINDOWS`
3. return first non-empty candidate as absolute path (`Path(...).resolve(strict=False)`)

`get_storage_root()` memoizes this path in `_storage_root`.

## 3) Prefix normalization and safety

Functions:
- `_normalize_prefix(prefix)`
- `_resolve_prefix_path(prefix)`

Safety rules:
- normalize separators to `/`
- trim outer separators
- reject `..` path parts
- ensure resolved target is still under storage root (`target.relative_to(root)`)

If path escapes root, an error is raised.

## 4) Listing behavior

Function: `list_prefix(prefix)`

Behavior:
- resolves prefix to a directory under root
- if missing/not-directory: returns empty lists
- iterates immediate children only (`target.iterdir()`)
- directories become `folders` entries with trailing `/` key
- files are filtered by extension tuple:
  - `.h5`
  - `.hdf5`
  - `.hdf`
- file metadata includes `size` and UTC `last_modified`

Returned tuple:
- `folders`
- `files`
- `normalized_prefix`

## 5) Breadcrumb generation

Function: `make_breadcrumbs(prefix)`

Behavior:
- always includes root breadcrumb (`{"name": "Root", "prefix": ""}`)
- appends one breadcrumb per prefix segment
- each breadcrumb `prefix` can be reused directly in `?prefix=` navigation

## 6) API route behavior

### `GET /api/browse`

- reads `prefix` query parameter
- calls `list_prefix(prefix)`
- computes breadcrumbs from normalized prefix
- returns:
  - `success`
  - `prefix`
  - `total`
  - `breadcrumbs`
  - `folders`
  - `files`
  - `storage_root`

Error behavior:
- any exception currently returns `500` with `{"success": false, "error": ...}`

### `GET /health`

Returns:
- `status: "ok"`
- `service: "H5API"`

## 7) Frontend template behavior (`H5API/templates/index.html`)

The UI is server-rendered static HTML + client-side JS.

Main runtime behaviors:
- calls `${API_BASE}/api/browse` using `fetch`
- tracks prefix state and updates URL querystring
- renders:
  - breadcrumbs
  - folder cards
  - HDF5 file table
- opens external viewer URL using `window.__VIEWER_BASE__`

Runtime JS config:
- `window.__API_BASE__` (default `window.location.origin`)
- `window.__VIEWER_BASE__` (default `http://localhost:3000`)

## 8) Notes for maintainers

- H5API is intentionally simple; no caching layer is currently implemented.
- `/api/browse` is immediate-directory listing only (non-recursive).
- Keep route responses stable if frontend consumes exact fields.
