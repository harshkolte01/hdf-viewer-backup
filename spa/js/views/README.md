# js/views

The `views/` layer owns the SPA shell and updates it region by region.

## Files

### `viewerView.js`

What it does:
- validates the shell DOM contract
- renders the sidebar, topbar, subbar, and main display pane
- coordinates shell-level delegated events
- routes export actions to the active runtime

Current SPA responsibilities:
1. render the sidebar tree and the metadata panel below it
2. render the breadcrumb, back button, and fullscreen button
3. render the display subbar for matrix, line, and heatmap controls
4. render the main display pane through `renderViewerPanel(state)`
5. keep legacy inspect nodes hidden for compatibility

Main delegated events:
- sidebar open/close
- back to files
- fullscreen
- breadcrumb selection
- display tab changes
- export menu interactions
- line and heatmap toolbar controls exposed through shared actions

## Render Loop

```text
setState(...)
  -> subscribe(queueRender)
  -> requestAnimationFrame(renderApp)
  -> renderViewerView(state, { missingFile })
    -> renderSidebarTree(state)
    -> renderViewerTopBar(state)
    -> renderPreviewToolbar(state)
    -> renderViewerPanel(state)
  -> bindViewerViewEvents(root, actions)
```
