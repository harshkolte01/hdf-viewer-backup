# css

Stylesheets for the `spa/` frontend copy.

The SPA shell uses shared design tokens from `tokens.css`, shell layout rules from `viewer.css`, and the main display/runtime styles from `viewer-panel.css`. Metadata styling is shared too, but in the SPA it is rendered inside the sidebar below the tree.

## Files

### `tokens.css`

What it does:
- defines shared design tokens used by all other stylesheets
- provides color, spacing, radius, shadow, and typography defaults

Notable note:
- `--sidebar-width` is still defined here as a base token
- the SPA viewer shell overrides it in `viewer.css` with a wider `clamp(...)` value for the tree + metadata sidebar

### `app.css`

What it does:
- global reset and base element styles
- shared layout helpers
- shared status bar styling
- shared button, list, and table primitives

### `home.css`

What it does:
- lightweight shim kept for load-order compatibility
- currently contains little SPA-specific behavior

### `viewer.css`

What it does:
- defines the SPA viewer shell layout
- sizes the sidebar and main area
- handles responsive sidebar collapse
- styles the HDF5 tree
- styles the metadata section that now lives under the tree

Key areas:
- `.viewer-page` - main grid shell
- `.viewer-sidebar` - left column
- `.sidebar-section-tree` - tree block
- `.sidebar-section-metadata` - metadata block below the tree
- `.viewer-topbar` - breadcrumb, back button, fullscreen button
- `.viewer-subbar` - display tabs and per-view controls

### `viewer-panel.css`

What it does:
- styles the main display pane content
- styles matrix, line, and heatmap previews/runtimes
- defines shared metadata markup styles such as `.metadata-simple`, `.info-row`, and `.json-view`

SPA note:
- the main panel is display-only in this copy
- metadata styles from this file are reused by the sidebar metadata panel

### `components/`

See [components/README.md](components/README.md) for `tree.css`, `table.css`, and `charts.css`.

## Load Order In `spa/index.html`

```html
tokens.css
app.css
home.css
viewer.css
viewer-panel.css
components/tree.css
components/table.css
components/charts.css
```
