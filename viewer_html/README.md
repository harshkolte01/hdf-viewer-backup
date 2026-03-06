# Viewer HTML

Plain-script frontend for viewing HDF5 data through the backend API.

Default local integration:
- Backend API: `http://localhost:5000`
- H5API browser (optional helper app): `http://localhost:5100`

`viewer_html` itself is static and can be hosted on any port.

## What this frontend does

- opens a file key using `?file=<object-key>`
- shows lazy HDF5 tree navigation
- supports inspect mode (metadata)
- supports display mode with:
  - matrix view
  - line graph view
  - heatmap view
- supports full runtimes for matrix/line/heatmap
- supports export actions (CSV and PNG where supported)

## Important files

- `viewer_html/index.html`
  - static shell and script load order.

- `viewer_html/config/runtime-config.js`
  - runtime API base configuration.

- `viewer_html/js/app-viewer.js`
  - app bootstrap and deep-link handling.

- `viewer_html/js/views/viewerView.js`
  - shell rendering + delegated UI events + export menu routing.

- `viewer_html/js/api/hdf5Service.js`
  - frontend cache/dedupe service for backend calls.

- `viewer_html/js/state/reducers/*.js`
  - viewer behaviors (files/tree/view/display-config/data/compare).

- `viewer_html/js/components/viewerPanel/runtime/*.js`
  - matrix, line, heatmap runtime engines.

## Run locally

```bash
cd viewer_html
python -m http.server 3000
```

Open with deep link:

```text
http://localhost:3000/?file=<url-encoded-object-key>
```

## Configuration

Set backend URL in:
- `viewer_html/config/runtime-config.js`

Default value:

```js
window.__CONFIG__.API_BASE_URL = "http://localhost:5000";
```

## Documentation

Start here:
- `viewer_html/docs/README.md`
