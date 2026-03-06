# API Reference

Base URL (local default): `http://localhost:5100`

## `GET /`

Returns H5API browser page.

Response:
- HTML (`templates/index.html`)

## `GET /api/browse`

Lists immediate folders and HDF5 files for a prefix.

Query params:
- `prefix` (optional string, default `""`)

Validation and normalization:
- backslashes are normalized to `/`
- leading/trailing `/` are trimmed
- `.` segments are ignored
- `..` segments are rejected
- resolved target must remain under configured storage root

Success response (`200`):

```json
{
  "success": true,
  "prefix": "mission/day1",
  "total": 5,
  "breadcrumbs": [
    {"name": "Root", "prefix": ""},
    {"name": "mission", "prefix": "mission"},
    {"name": "day1", "prefix": "mission/day1"}
  ],
  "folders": [
    {"key": "mission/day1/raw/", "name": "raw", "type": "folder"}
  ],
  "files": [
    {
      "key": "mission/day1/output.h5",
      "name": "output.h5",
      "type": "file",
      "size": 123456,
      "last_modified": "2026-03-06T12:00:00+00:00"
    }
  ],
  "storage_root": "C:/.../files"
}
```

Error response (`500`):

```json
{
  "success": false,
  "error": "..."
}
```

Listing behavior:
- non-recursive (current prefix only)
- only HDF5 extensions are included in `files`:
  - `.h5`
  - `.hdf5`
  - `.hdf`

## `GET /health`

Returns liveness information.

Success response (`200`):

```json
{
  "status": "ok",
  "service": "H5API"
}
```
