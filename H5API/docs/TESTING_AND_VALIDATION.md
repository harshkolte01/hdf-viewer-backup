# Testing And Validation

H5API currently has no dedicated automated test suite in this folder.

Use this checklist for validation after changes.

## 1) Static sanity checks

From repo root:

```bash
python -m py_compile H5API/app.py
```

## 2) Runtime smoke test

1. Start H5API:

```bash
cd H5API
python app.py
```

2. Verify endpoints:
- `GET http://localhost:5100/health`
- `GET http://localhost:5100/api/browse`
- `GET http://localhost:5100/api/browse?prefix=<known-folder>`

3. Open UI:
- `http://localhost:5100`
- click into folders
- click breadcrumbs to navigate back
- verify HDF5 files are listed

## 3) Prefix safety checks

Try:
- `/api/browse?prefix=..`
- `/api/browse?prefix=../../etc`

Expected:
- request should be rejected (server error response with prefix validation message).

## 4) Extension filtering checks

In a folder containing mixed files:
- verify only `.h5`, `.hdf5`, `.hdf` appear in `files` list
- verify directories always appear in `folders`

## 5) Viewer handoff check

On UI table, click `Go` for a file.

Expected:
- new tab opens `${VIEWER_BASE}/?file=<encoded-key>`
- default `VIEWER_BASE` is `http://localhost:3000`

## Recommendation

Add automated route tests (Flask test client + mocks) if H5API behavior grows beyond simple browse operations.
