// Viewer HTML module: Assembles the viewer panel wrapper and chooses inspect or display section rendering.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for components/viewerPanel/render.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading components/viewerPanel/render.");
    return;
  }
  var moduleState = ensurePath(ns, "components.viewerPanel.render");

// Top-level render entry point: the SPA shell now keeps the main area display-only; metadata lives in the sidebar.
function renderViewerPanel(state) {
  const isLineFixedPage =
    (state.displayTab || "line") === "line" &&
    state.lineFullEnabled === true;

  return `
    <div class="viewer-panel is-display">
      <div class="panel-canvas ${isLineFixedPage ? "panel-canvas-line-fixed" : ""}">
        ${renderDisplayContent(state)}
      </div>
    </div>
  `;
}
  if (typeof renderViewerPanel !== "undefined") {
    moduleState.renderViewerPanel = renderViewerPanel;
    global.renderViewerPanel = renderViewerPanel;
  }
  if (typeof buildLineSelectionKey !== "undefined") {
    moduleState.buildLineSelectionKey = buildLineSelectionKey;
    global.buildLineSelectionKey = buildLineSelectionKey;
  }
  if (typeof buildMatrixSelectionKey !== "undefined") {
    moduleState.buildMatrixSelectionKey = buildMatrixSelectionKey;
    global.buildMatrixSelectionKey = buildMatrixSelectionKey;
  }
  if (typeof buildMatrixBlockKey !== "undefined") {
    moduleState.buildMatrixBlockKey = buildMatrixBlockKey;
    global.buildMatrixBlockKey = buildMatrixBlockKey;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("components/viewerPanel/render");
  }
})(typeof window !== "undefined" ? window : globalThis);
