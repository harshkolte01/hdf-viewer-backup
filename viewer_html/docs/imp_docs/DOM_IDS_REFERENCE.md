# DOM IDs Reference — Viewer HTML Shell

This document covers how the viewer's JavaScript is wired to the HTML shell via DOM IDs, what happens when IDs are missing, and how to safely remove or change them.

---

## Overview

The viewer JS is fully decoupled from HTML structure and layout. It never hardcodes selectors like `querySelector(".some-class")` for its core wiring. Instead, a single file — `js/core/domRefs.js` — acts as the authoritative registry. It:

1. Defines the list of all required IDs (`REQUIRED_IDS`)
2. Collects all DOM nodes into one object (`collect()`)
3. Validates that every required ID exists before boot (`validate()`)

All other modules receive references from this collected object — they never call `getElementById` themselves.

---

## Required IDs

These 24 IDs **must** exist in the HTML shell. They are defined in `REQUIRED_IDS` inside `js/core/domRefs.js`.

| ID | Element / Role |
|---|---|
| `viewer-app` | Root wrapper `<div>` — receives sidebar state classes (`sidebar-collapsed`, `sidebar-open`) |
| `viewer-sidebar` | `<aside>` sidebar panel container |
| `sidebar-header` | Sidebar header area |
| `tree-panel` | Tree section container inside the sidebar |
| `tree-list` | `<ul>` where file/group tree nodes are injected by `sidebarTree.js` |
| `tree-status` | Status text inside the tree panel (loading, errors, empty states) |
| `viewer-main` | `<section>` main content area |
| `viewer-topbar` | Top bar container |
| `breadcrumb-file` | `<span>` showing current file name inside the breadcrumb |
| `breadcrumb-path` | Breadcrumb container |
| `viewer-subbar` | Tab and action bar — toggled `hidden` until a dataset node is selected |
| `subbar-tabs` | Slot where dataset tabs are rendered dynamically |
| `subbar-actions` | Slot where action buttons (export, etc.) are rendered dynamically |
| `viewer-panel` | Panel wrapper that holds the two panes below |
| `display-pane` | Chart / visualization output pane (toggled `hidden` vs inspect mode) |
| `inspect-pane` | Metadata / attributes / raw data inspect output pane |
| `display-status` | Status message element for the display pane |
| `inspect-status` | Status message element for the inspect pane |
| `global-status` | App-level status bar for boot messages and fatal errors |
| `sidebar-backdrop` | Overlay `<div>` shown on mobile when sidebar is open |
| `sidebar-toggle-btn` | Hamburger button that opens/closes the sidebar |
| `sidebar-close-btn` | Close button inside the sidebar header |
| `viewer-back-btn` | "Back to files" button in the topbar |
| `viewer-fullscreen-btn` | Fullscreen toggle button in the topbar |

> **Note:** IDs are case-sensitive. `Viewer-App` ≠ `viewer-app`.

---

## Additional HTML Requirements

Beyond IDs, the segmented view-mode buttons must carry `data-view-mode` attributes. These are queried by the view actions module:

```html
<button class="seg-btn" data-view-mode="display" type="button">Display</button>
<button class="seg-btn active" data-view-mode="inspect" type="button">Inspect</button>
```

If these attributes are missing, switching between Display and Inspect modes will silently do nothing.

---

## Using the Same JS/CSS in a Different HTML File

The JS and CSS are completely portable. If you copy all `js/` and `css/` files to a new project with a different HTML layout, **it will work identically** as long as:

1. All 24 IDs from `REQUIRED_IDS` are present in the new HTML.
2. The `data-view-mode` buttons exist as described above.
3. The `<script>` tags load files in the same order as in the original `index.html` (the load order matters because modules depend on earlier ones being registered on `window.HDFViewer`).
4. `./config/runtime-config.js` is loaded first, before any deferred scripts.

The HTML element types, class names, nesting, and visual layout can be completely different — only the IDs matter to the JS.

---

## What Happens When an ID Is Missing or Wrong

Boot is a two-step validation:

### Step 1 — `domRefs.validate()` is called
`js/views/viewerView.js` exposes `validateViewerDomIds()` which calls `domRefs.validate(document)`. This loops through all `REQUIRED_IDS` and collects any that return `null` from `getElementById`.

### Step 2 — `app-viewer.js` checks the result
```js
var validation = validateViewerDomIds(document);
if (!validation.ok) {
  setBootFailureStatus(
    "Viewer bootstrap failed: missing required DOM IDs (" +
      validation.missing.join(", ") +
    ")."
  );
  return; // hard stop — viewer never starts
}
```

**Outcome:** If any required ID is absent, the viewer hard-stops at boot. Specifically:
- `#global-status` displays the error message with the names of all missing IDs.
- `console.error` logs `[HDFViewer] Missing required viewer DOM ids: <id1>, <id2>, ...` to the browser devtools.
- No tree loads, no panel renders, no events are bound — nothing works.

---

## How to Safely Remove an ID You Don't Need

If a certain element won't exist in your HTML (e.g. you're removing the fullscreen button), follow these steps:

### 1. Remove from `REQUIRED_IDS` in `js/core/domRefs.js`
```js
// Remove this line from the REQUIRED_IDS array:
"viewer-fullscreen-btn",
```
This stops boot validation from failing.

### 2. Remove from `collect()` in `js/core/domRefs.js`
```js
// Remove this line from the collect() return object:
viewerFullscreenBtn: rootDoc.getElementById("viewer-fullscreen-btn"),
```
This stops a `null` reference from being passed to other modules.

### 3. Search for usages across all JS files
Search for the property name (e.g. `viewerFullscreenBtn`) in the `js/` directory. Any module that reads that property and tries to attach an event listener, toggle a class, or set text on it will either:
- Need the code removed, or
- Need a `null` guard added: `if (refs.viewerFullscreenBtn) { ... }`

> **Safe by default:** The helper functions in `domRefs.js` — `setStatus`, `setHidden`, `setHtml`, `setText`, `toggleClass` — all begin with `if (!element) return`. So if a `null` ref is passed to them, they silently no-op without crashing. The risk is only in code that directly calls methods on the ref (e.g. `refs.viewerFullscreenBtn.addEventListener(...)`), which will throw a `TypeError` if the element is null.

---

## Summary

| Scenario | Result |
|---|---|
| All 24 IDs present, correct names | Viewer boots and runs normally |
| One or more IDs missing or misspelled | Hard boot failure, error shown in `#global-status`, logged to console |
| ID present but `data-view-mode` missing | View mode switching silently broken |
| ID removed from `REQUIRED_IDS` + `collect()` but still used in other JS | `TypeError` at runtime when that code runs |
| ID removed from `REQUIRED_IDS` + `collect()` + all usages cleaned up | Safe — feature just doesn't exist |
| Different HTML layout, same IDs, same script load order | Works identically |
