# css/components

Component-scoped stylesheet entry points.

These files keep component boundaries explicit in `spa/index.html`, even when most of the detailed rules live in the broader shell stylesheets.

## Files

### `tree.css`

What it does:
- component entry point for tree-related styling
- pairs with the canonical tree rules in `spa/css/viewer.css`

Used by:
- the sidebar tree rendered by `spa/js/components/sidebarTree.js`

### `table.css`

What it does:
- styles reusable file-list table rows, badges, and actions

Used by:
- shared home/file-list screens when those table styles are needed

### `charts.css`

What it does:
- provides lightweight shared chart surface rules
- gives line and heatmap containers a common baseline for sizing and structure

Used by:
- the main display runtimes styled further in `spa/css/viewer-panel.css`
