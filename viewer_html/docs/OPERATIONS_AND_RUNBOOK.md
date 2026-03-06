# Operations And Runbook

Practical run and troubleshooting guide for `viewer_html/`.

## 1) Local setup

Recommended local ports:
- Backend API: `5000`
- H5API browser service: `5100`
- Viewer static host: `3000` (or any free port)

`viewer_html` itself is static content and can run on any port.

## 2) Start sequence

1. Start backend service (must expose `/files` APIs on port `5000`).
2. Optional: start H5API service on port `5100` if you use the browse UI.
3. Serve `viewer_html/` statically.

Example static serve:

```bash
cd viewer_html
python -m http.server 3000
```

Open viewer with deep link:

```text
http://localhost:3000/?file=<url-encoded-object-key>
```

## 3) Runtime config check

File: `viewer_html/config/runtime-config.js`

Expected default:

```js
window.__CONFIG__.API_BASE_URL = "http://localhost:5000";
```

If backend runs elsewhere, update this value before loading the page.

## 4) Functional smoke checks

- Tree loads after opening with `?file=`.
- Selecting group updates inspect metadata.
- Selecting dataset enables preview in display mode.
- Matrix full view streams blocks while scrolling.
- Line full view supports zoom and pan.
- Heatmap full view loads preview first and then high-res.
- Export menu works after full runtime is loaded.

## 5) Common issues

## Viewer says blocked / missing file parameter

Symptom:
- status shows viewer blocked
- tree does not load

Fix:
- open URL with `?file=<object-key>`
- ensure object key matches backend listing format

## API calls fail immediately

Symptom:
- status shows network or HTTP errors

Fix:
- backend is not running on configured URL
- wrong `API_BASE_URL` in `runtime-config.js`
- CORS misconfiguration on backend

## Export buttons appear but export fails

Symptom:
- "Load full ... before exporting" or export action errors

Fix:
- first click `Load full view` / `Load full line` / `Load high-res`
- exports depend on runtime shell `__exportApi`

## Tree does not refresh after backend content changes

Symptom:
- stale file/tree entries

Fix:
- trigger file refresh path (`/files/refresh`) from app flow
- hard refresh browser tab

## UI looks broken

Symptom:
- missing layout/styles or controls

Fix:
- ensure `index.html` CSS links are intact
- verify script load order was not changed
- verify required IDs from `js/core/domRefs.js` are present

## 6) Safe change checklist

Before merging viewer changes:
- keep static shell IDs unchanged unless all call sites are updated
- keep script order stable in `index.html`
- update docs when API or behavior changes
- test matrix/line/heatmap full views and exports

## 7) Deployment notes

- This frontend can be hosted from any static server.
- Use environment/template injection to set `window.__CONFIG__` in production.
- Ensure reverse proxy allows browser access from viewer host to backend API host.
