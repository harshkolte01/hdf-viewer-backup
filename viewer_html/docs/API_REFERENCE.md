# API Reference (Viewer Integration)

This document describes how `viewer_html` calls the backend API.

Base URL (default): `http://localhost:5000`

Configured in:
- `viewer_html/config/runtime-config.js`
- consumed by `viewer_html/js/core/config.js`

## Endpoints used by viewer

## `GET /files`

Used by:
- `actions.loadFiles()`

Expected response fields (after normalization):
- `success`
- `files[]` with:
  - `key`
  - `type` (`file` or `folder`)
  - `size`
  - `last_modified`
  - `etag`
- `files_count`
- `folders_count`
- `truncated`
- `cached`

## `POST /files/refresh`

Used by:
- `actions.refreshFileList()`

Behavior in frontend:
- clears frontend caches
- reloads file list

## `GET /files/<key>/children`

Used by:
- `actions.loadTreeChildren(path)`

Query params sent by viewer:
- `path` (required by call site)
- `etag` (optional)

Expected normalized fields:
- `success`
- `key`
- `path`
- `children[]` entries such as:
  - `type`
  - `name`
  - `path`
  - `num_children`
  - `shape`
  - `dtype`
  - `ndim`

## `GET /files/<key>/meta`

Used by:
- `actions.loadMetadata(path)`

Query params sent by viewer:
- `path`
- `etag` (optional)

Expected normalized fields:
- `success`
- `key`
- `metadata` (object)

## `GET /files/<key>/preview`

Used by:
- `actions.loadPreview(path)`

Query params sent by viewer:
- `path`
- `mode` (`table` via `auto`, `line`, or `heatmap` based on tab)
- `max_size`
- `detail` (`fast` in preview path)
- `include_stats`
- `display_dims` (optional)
- `fixed_indices` (optional)
- `etag` (optional)

Expected normalized fields:
- `success`
- `key`
- `path`
- `preview_type`
- `dtype`
- `shape`
- `ndim`
- `display_dims`
- `fixed_indices`
- `mode`
- `table`
- `plot`
- `profile`
- `stats`
- `limits`

Frontend behavior:
- can return cached preview immediately
- may trigger background refresh (`staleWhileRefresh`)

## `GET /files/<key>/data`

Used by full runtimes.

### Matrix mode

Params used by viewer:
- `mode=matrix`
- `path`
- `row_offset`
- `row_limit`
- `col_offset`
- `col_limit`
- `display_dims` (optional)
- `fixed_indices` (optional)
- `etag` (optional)

Expected normalized fields:
- `mode`
- `data` (2D array)
- `shape`
- `dtype`
- `row_offset`
- `col_offset`
- `downsample_info`

### Line mode

Params used by viewer:
- `mode=line`
- `path`
- `quality`
- `max_points`
- `line_offset`
- `line_limit`
- `line_dim` (optional)
- `line_index` (optional)
- `display_dims` (optional)
- `fixed_indices` (optional)
- `etag` (optional)

Expected normalized fields:
- `mode`
- `data` (1D series)
- `shape`
- `dtype`
- `axis`
- `index`
- `quality_requested`
- `quality_applied`
- `line_offset`
- `line_limit`
- `requested_points`
- `returned_points`
- `line_step`
- `downsample_info`

### Heatmap mode

Params used by viewer:
- `mode=heatmap`
- `path`
- `max_size`
- `include_stats`
- `display_dims` (optional)
- `fixed_indices` (optional)
- `etag` (optional)

Expected normalized fields:
- `mode`
- `data` (2D array)
- `shape`
- `dtype`
- `stats`
- `sampled`
- `downsample_info`
- `requested_max_size`
- `effective_max_size`
- `max_size_clamped`

## `GET /files/<key>/export/csv`

Used when user selects full CSV export from subbar menu.

Viewer builds URL and triggers browser download.

Common params:
- `path`
- `mode` (`matrix`, `line`, `heatmap`)
- `display_dims` (optional)
- `fixed_indices` (optional)
- `etag` (optional)

Line export may also include:
- `line_dim`
- `line_index`
- `compare_paths`

## Error model in frontend

`api/client.js` converts failures to `ApiError`:
- `code=HTTP_ERROR` for non-2xx responses
- `code=ABORTED` for cancelled requests
- `code=NETWORK_ERROR` for connection failures

Runtimes/actions treat aborted requests as non-fatal and ignore stale responses.
