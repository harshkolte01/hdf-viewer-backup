# Viewer HTML

`viewer_html/` is the browser frontend for exploring HDF5 files.

It is a plain JavaScript app (no bundler, no framework build step) and talks to the backend API directly.

## Default integration

- Backend API base URL: `http://localhost:5000`
- Runtime config file: `viewer_html/config/runtime-config.js`

`viewer_html` does not read storage paths directly. File/path selection is done through the backend API.

## What is implemented

- Static viewer shell with fixed DOM IDs (`index.html`)
- File tree navigation with lazy node loading
- Inspect mode for metadata
- Display mode with three tabs:
  - matrix table
  - line graph
  - heatmap
- Full runtimes for matrix/line/heatmap with dedicated interactions
- CSV/PNG export from runtime views
- Deep-link open using `?file=<object-key>`

## Architecture at a glance

- `config/runtime-config.js`
  - injects runtime config (`window.__CONFIG__`)
- `js/core/`
  - namespace setup, endpoint config, DOM ID contract
- `js/api/`
  - fetch wrapper, contract normalization, service-level caches
- `js/state/`
  - mutable store + action factories
- `js/components/`
  - sidebar tree + viewer panel rendering and runtime engines
- `js/views/viewerView.js`
  - top-level shell rendering + delegated event routing
- `js/app-viewer.js`
  - app bootstrap and lifecycle wiring

## Run locally

Serve `viewer_html/` as static files.

Example with Python:

```bash
cd viewer_html
python -m http.server 3000
```

Open:
- `http://localhost:3000/?file=<url-encoded-object-key>`

Note:
- Backend must be reachable at the configured API base URL.
- The object key must be a valid backend key (for example a key returned by `/files/`).

## Configuration

File: `viewer_html/config/runtime-config.js`

```js
window.__CONFIG__.API_BASE_URL = "http://localhost:5000";
```

You can override this before app scripts load.

## Full docs

See:
- `viewer_html/docs/README.md`
