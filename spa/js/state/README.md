# js/state

The `state/` layer is the single source of truth for SPA viewer UI state.

It uses one mutable store object, plain action functions, and a subscriber list that drives re-renders.

## Files

### `store.js`

What it does:
- defines the global `state`
- exposes `getState()`, `setState()`, and `subscribe()`

Important fields:

| Field | Purpose |
|------|---------|
| `route` | current page route (`home` or `viewer`) |
| `selectedFile` | active backend file key |
| `selectedPath` | active HDF5 path |
| `selectedNodeType` | selected node type (`group` or `dataset`) |
| `expandedPaths` | expanded tree groups |
| `childrenCache` | lazily loaded tree children |
| `metadata` | metadata shown in the sidebar metadata panel |
| `preview` | preview shown in the main display panel |
| `displayTab` | active display tab (`line`, `heatmap`, `table`) |
| `viewMode` | compatibility field kept pinned to `display` in the SPA shell |
| `sidebarOpen` | whether the sidebar is open |

### `reducers.js`

What it does:
- composes all action modules into a single `actions` object
- publishes that object on `window.actions`

### `reducers/`

See [reducers/README.md](reducers/README.md).

## Data Flow Example

```text
User selects a dataset in the tree
  -> actions.selectTreeNode(...)
  -> state.selectedPath updates
  -> actions.loadMetadata(...) refreshes sidebar metadata
  -> actions.loadPreview(...) refreshes the main display panel
  -> subscribe(queueRender) schedules renderApp()
  -> views/viewerView.js updates shell regions
```
