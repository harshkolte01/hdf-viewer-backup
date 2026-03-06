# H5API

Filesystem-backed Flask service that provides a lightweight HDF5 file browser UI and JSON browse API.

Default runtime:
- Host: `0.0.0.0`
- Port: `5100`

## What is implemented

- `GET /`
  - Serves browser UI from `templates/index.html`.
- `GET /api/browse`
  - Lists immediate folders and HDF5 files (`.h5`, `.hdf5`, `.hdf`) under a prefix.
- `GET /health`
  - Liveness endpoint.

The implementation is filesystem-only. It does not depend on buckets/object storage.

## Main files

- `H5API/app.py`
  - Flask app setup, storage-root resolution, prefix-safe listing, API routes.
- `H5API/templates/index.html`
  - Single-page browser UI that calls `/api/browse`.
- `H5API/.env`
  - local runtime/storage configuration.

## Storage configuration

Set one of the following:
- `STORAGE_ROOT` (explicit root, preferred)
- `STORAGE_PATH_LINUX`
- `STORAGE_PATH_WINDOWS`

Resolution order in `app.py`:
- Windows: `STORAGE_ROOT` -> `STORAGE_PATH_WINDOWS` -> `STORAGE_PATH_LINUX`
- Linux/macOS: `STORAGE_ROOT` -> `STORAGE_PATH_LINUX` -> `STORAGE_PATH_WINDOWS`

If no usable path is configured, startup fails with a clear error.

## Path safety rules

- Prefix normalization converts `\\` to `/`, trims separators, rejects `..`.
- Resolved prefix path must remain inside configured storage root.
- Browse output includes only immediate directory entries for requested prefix.

## Run locally

```bash
cd H5API
pip install -r requirements.txt
python app.py
```

Open:
- `http://localhost:5100`

## Browse API contract

`GET /api/browse?prefix=<relative-folder>`

Response fields:
- `success`
- `prefix`
- `total`
- `breadcrumbs`
- `folders`
- `files`
- `storage_root`

Folder item shape:
- `key` (always trailing `/`)
- `name`
- `type="folder"`

File item shape:
- `key`
- `name`
- `type="file"`
- `size`
- `last_modified` (UTC ISO)

## UI behavior

The UI in `templates/index.html`:
- reads current prefix from querystring (`?prefix=`)
- renders clickable breadcrumbs and folder cards
- renders file table with size/date
- provides `Go` button to open viewer URL in new tab

Runtime JS config hooks:
- `window.__API_BASE__` (defaults to same origin)
- `window.__VIEWER_BASE__` (defaults to `http://localhost:3000`)

## Health endpoint

`GET /health` returns:

```json
{"status": "ok", "service": "H5API"}
```

## Documentation

Extended docs are in:
- `H5API/docs/README.md`
