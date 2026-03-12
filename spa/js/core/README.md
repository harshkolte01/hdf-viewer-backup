# js/core

The `core/` layer must load before any other SPA module.

It creates the namespace, resolves runtime configuration, and defines the DOM contract expected by the shell renderer.

## Files

### `namespace.js`

What it does:
- creates `window.HDFViewer`
- provides module registration helpers such as `ensurePath`, `registerModule`, and `requireModules`

### `config.js`

What it does:
- reads `window.__CONFIG__`
- normalizes `API_BASE_URL`
- exposes endpoint builders used by the API layer

### `domRefs.js`

What it does:
- declares the required DOM IDs for the shell
- collects live references to them
- provides small DOM helper utilities

Notable SPA IDs:
- `tree-panel`
- `metadata-panel`
- `display-pane`
- `inspect-pane` and `inspect-status` still exist for compatibility, but stay hidden in the SPA shell

Key helpers:
- `collect(doc)`
- `validate(doc)`
- `setStatus(el, message, tone)`
- `setHidden(el, hidden)`
- `setHtml(el, html)`
- `setText(el, text)`

## Bootstrap Order

```text
config/runtime-config.js
-> core/namespace.js
-> core/config.js
-> core/domRefs.js
-> remaining modules
```
