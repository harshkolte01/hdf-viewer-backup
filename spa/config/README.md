# config

Runtime configuration bootstrap for the `spa/` viewer shell.

## File

### `runtime-config.js`

What it does:
- guarantees `window.__CONFIG__` exists
- provides a default `API_BASE_URL`
- gives `spa/js/core/config.js` a stable place to read backend configuration from

Default value:

```js
window.__CONFIG__.API_BASE_URL = "http://localhost:5000";
```

Load order:
- `spa/index.html` loads this before the SPA JavaScript modules
- if it runs after `spa/js/core/config.js`, the viewer falls back to `http://localhost:5000`

Used by:
- `spa/js/core/config.js`
- all API calls built through `spa/js/api/client.js` and `spa/js/api/hdf5Service.js`

## SPA Notes

- `runtime-config.js` only controls the backend base URL.
- Host file selection is handled separately by the URL bridge in `spa/index.html`.
- Supported incoming params are still normalized to `?file=...` before `spa/js/app-viewer.js` boots.

## Deployment

1. Generate `runtime-config.js` with the correct backend URL for that environment.
2. Or inject `window.__CONFIG__` from the host page before `runtime-config.js` runs.
3. Leave the rest of the SPA source unchanged.
