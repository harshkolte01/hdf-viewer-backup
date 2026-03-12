# SPA Docs

Documentation entry point for the `spa/` frontend copy.

## Start Here

- [../HOST_FILE_SELECTION_GUIDE.md](../HOST_FILE_SELECTION_GUIDE.md) - how a host UI passes `fileKey` into `spa/index.html`
- `VIEWER_HTML.md` - shared viewer runtime overview
- `VIEWER_HTML_IMPLEMENTATION.md` - code-order walkthrough for the shared runtime modules copied into `spa/js`
- `API_REFERENCE.md` - frontend-to-backend API usage
- `FILE_MAP.md` - ownership map for the shared viewer codebase
- `OPERATIONS_AND_RUNBOOK.md` - run and troubleshooting notes
- `TESTING_AND_VALIDATION.md` - validation checklist

## SPA-Specific Notes

- `spa/index.html` is the shell entry point.
- The SPA main panel is display-only.
- Metadata is rendered below the tree in the left sidebar.
- The old inspect pane remains in the DOM only for compatibility with shared code paths.
- Some detailed docs in this folder still describe the shared `viewer_html` shell. When they conflict with the SPA shell, prefer the code in:
  - `spa/index.html`
  - `spa/js/views/viewerView.js`
  - `spa/js/components/sidebarTree.js`
  - `spa/js/components/viewerPanel/render/sections.js`

## Source Of Truth

Primary SPA implementation files:
- `spa/index.html`
- `spa/config/runtime-config.js`
- `spa/js/app-viewer.js`
- `spa/js/views/viewerView.js`
- `spa/js/components/sidebarTree.js`
- `spa/js/components/viewerPanel/render/sections.js`
- `spa/js/state/*.js`

If docs and code differ, the code is authoritative.
