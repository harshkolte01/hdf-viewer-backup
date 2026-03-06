# Operations And Runbook

## Local run

From `H5API/`:

```bash
pip install -r requirements.txt
python app.py
```

Default URL:
- `http://localhost:5100`

## Environment variables

Server:
- `HOST` (default `0.0.0.0`)
- `PORT` (default `5100`)
- `DEBUG` (`true|false`)

Storage:
- `STORAGE_ROOT` (preferred explicit path)
- `STORAGE_PATH_LINUX`
- `STORAGE_PATH_WINDOWS`

## Production notes

This app is a standard Flask WSGI app and can run with gunicorn/uwsgi.

Example:

```bash
gunicorn app:app --bind 0.0.0.0:5100
```

## Health checks

- call `GET /health`
- expected `200` with `{"status": "ok", "service": "H5API"}`

## Common troubleshooting

### Startup fails with storage configuration error

Cause:
- no valid `STORAGE_ROOT` or OS fallback path configured.

Fix:
- set at least one valid storage path.

### `/api/browse` always empty

Possible causes:
- wrong storage root path
- no readable entries in target prefix
- prefix points to non-directory path

### `/api/browse` returns 500

Likely causes:
- invalid prefix (contains traversal segments)
- permission/read error on filesystem path

### UI loads but no data

Check:
- browser devtools network for `/api/browse` status
- `window.__API_BASE__` overrides in page runtime

### Go button opens wrong viewer

Check:
- `window.__VIEWER_BASE__` value
- expected default is `http://localhost:3000`
