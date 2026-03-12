# js/components

The `components/` layer contains the main UI surfaces of the SPA viewer:
- the left sidebar, which includes the HDF5 tree and the metadata panel
- the main display panel, which renders previews and full runtimes

## Files

### `sidebarTree.js`

What it does:
- renders the entire sidebar
- builds the HDF5 tree from cached tree state
- renders the metadata panel below the tree using shared metadata markup
- delegates tree interaction events

Main interactions:
- toggle group expansion
- select group or dataset nodes
- retry failed child loads
- add compatible datasets to line compare mode

Used by:
- `spa/js/views/viewerView.js`

### `viewerPanel.js`

What it does:
- stable facade for `renderViewerPanel`
- stable facade for `bindViewerPanelEvents`
- keeps the main panel API simple even though render/runtime logic is split across submodules

Used by:
- `spa/js/views/viewerView.js`

### `viewerPanel/`

See [viewerPanel/README.md](viewerPanel/README.md).

## Example Flow

```text
User selects a dataset in the tree
  -> sidebarTree.js dispatches actions.selectTreeNode(...)
  -> state updates selected path and node type
  -> data actions refresh metadata and preview
  -> views/viewerView.js re-renders sidebar + main panel
  -> viewerPanel runtime binds any active display shells
```
