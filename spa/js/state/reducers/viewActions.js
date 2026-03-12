// Viewer HTML module: Handles sidebar, mode/tab toggles, display options, and full-view enable transitions.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for state/reducers/viewActions.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading state/reducers/viewActions.");
    return;
  }
  var moduleState = ensurePath(ns, "state.reducers.viewActions");
function unpackDeps(deps) {
  const { actions, getState, setState, api, utils } = deps;
  const { getFiles, refreshFiles, getFileChildren, getFileMeta, getFilePreview } = api;
  const {
    normalizePath,
    getAncestorPaths,
    getNodeName,
    toSafeInteger,
    getDisplayConfigDefaults,
    normalizeShape,
    getDefaultDisplayDims,
    normalizeDisplayDimsForShape,
    normalizeFixedIndicesForShape,
    buildNextFixedIndices,
    buildDisplayDimsParam,
    buildFixedIndicesParam,
    areDisplayDimsEqual,
    areFixedIndicesEqual,
    resolveDisplayDimsFromConfig,
    getNextAvailableDim,
  } = utils;

  return {
    actions,
    getState,
    setState,
    getFiles,
    refreshFiles,
    getFileChildren,
    getFileMeta,
    getFilePreview,
    normalizePath,
    getAncestorPaths,
    getNodeName,
    toSafeInteger,
    getDisplayConfigDefaults,
    normalizeShape,
    getDefaultDisplayDims,
    normalizeDisplayDimsForShape,
    normalizeFixedIndicesForShape,
    buildNextFixedIndices,
    buildDisplayDimsParam,
    buildFixedIndicesParam,
    areDisplayDimsEqual,
    areFixedIndicesEqual,
    resolveDisplayDimsFromConfig,
    getNextAvailableDim,
  };
}
function createViewActions(deps) {
  const {
    actions,
    getState,
    setState,
    normalizeShape,
    normalizeDisplayDimsForShape,
    getDefaultDisplayDims,
  } = unpackDeps(deps);

  return {
  // Flips sidebar open/closed; used by the toggle button in the topbar
  toggleSidebar() {
    const current = getState();
    setState({ sidebarOpen: !current.sidebarOpen });
  },

  // Explicitly sets sidebar open state; called by the responsive breakpoint listener in app-viewer.js
  setSidebarOpen(open) {
    setState({ sidebarOpen: !!open });
  },

  // SPA shell is display-only in the main panel; keep viewMode pinned to display if any legacy caller invokes this.
  setViewMode(viewMode) {
    void viewMode;
    const mode = "display";
    setState({
      viewMode: mode,
    });

    const current = getState();
    if (current.route !== "viewer") {
      return;
    }

    if (current.selectedNodeType === "dataset") {
      void actions.loadPreview(current.selectedPath);
    }

    void actions.loadMetadata(current.selectedPath);
  },

  setDisplayTab(tab) {
    const nextTab = ["table", "line", "heatmap"].includes(tab) ? tab : "line";
    const snapshot = getState();
    const tabChanged = snapshot.displayTab !== nextTab;
    setState({
      displayTab: nextTab,
      ...(nextTab !== "table" ? { matrixFullEnabled: false } : {}),
      ...(nextTab !== "line" ? { lineFullEnabled: false } : {}),
      ...(nextTab !== "heatmap" ? { heatmapFullEnabled: false } : {}),
    });

    if (!tabChanged) {
      return;
    }

    const shouldReloadPreview =
      snapshot.route === "viewer" &&
      snapshot.viewMode === "display" &&
      snapshot.selectedNodeType === "dataset" &&
      snapshot.selectedPath !== "/";

    if (shouldReloadPreview) {
      void actions.loadPreview(snapshot.selectedPath);
    }
  },

  enableMatrixFullView() {
    const snapshot = getState();
    const shape = normalizeShape(snapshot.preview?.shape);
    const displayDims =
      normalizeDisplayDimsForShape(snapshot.displayConfig?.displayDims, shape) ||
      normalizeDisplayDimsForShape(snapshot.preview?.display_dims, shape) ||
      getDefaultDisplayDims(shape);

    const canEnable =
      snapshot.route === "viewer" &&
      snapshot.viewMode === "display" &&
      snapshot.selectedNodeType === "dataset" &&
      shape.length >= 2 &&
      Array.isArray(displayDims) &&
      displayDims.length === 2;

    if (!canEnable) {
      return;
    }

    setState({ matrixFullEnabled: true });
  },

  enableLineFullView() {
    const snapshot = getState();
    const shape = normalizeShape(snapshot.preview?.shape);
    const shapeValid = shape.length >= 1 && shape.every((size) => Number.isFinite(size) && size >= 0);
    const displayDims =
      normalizeDisplayDimsForShape(snapshot.displayConfig?.displayDims, shape) ||
      normalizeDisplayDimsForShape(snapshot.preview?.display_dims, shape) ||
      getDefaultDisplayDims(shape);

    const lineReady =
      shape.length === 1
        ? shape[0] > 0
        : Array.isArray(displayDims) &&
          displayDims.length === 2 &&
          shape[displayDims[0]] > 0 &&
          shape[displayDims[1]] > 0;

    const canEnable =
      snapshot.route === "viewer" &&
      snapshot.viewMode === "display" &&
      snapshot.selectedNodeType === "dataset" &&
      shapeValid &&
      lineReady;

    if (!canEnable) {
      return;
    }

    setState({ lineFullEnabled: true });
  },

  enableHeatmapFullView() {
    const snapshot = getState();
    const shape = normalizeShape(snapshot.preview?.shape);
    const displayDims =
      normalizeDisplayDimsForShape(snapshot.displayConfig?.displayDims, shape) ||
      normalizeDisplayDimsForShape(snapshot.preview?.display_dims, shape) ||
      getDefaultDisplayDims(shape);

    const canEnable =
      snapshot.route === "viewer" &&
      snapshot.viewMode === "display" &&
      snapshot.selectedNodeType === "dataset" &&
      shape.length >= 2 &&
      Array.isArray(displayDims) &&
      displayDims.length === 2 &&
      shape[displayDims[0]] > 0 &&
      shape[displayDims[1]] > 0;

    if (!canEnable) {
      return;
    }

    setState({ heatmapFullEnabled: true });
  },

  setNotation(notation) {
    const nextNotation = ["auto", "scientific", "exact"].includes(notation)
      ? notation
      : "auto";
    setState({ notation: nextNotation });
  },

  toggleLineGrid() {
    setState((prev) => ({ lineGrid: !prev.lineGrid }));
  },

  setLineAspect(value) {
    const nextValue = ["line", "point", "both"].includes(value) ? value : "line";
    setState({ lineAspect: nextValue });
  },

  toggleHeatmapGrid() {
    setState((prev) => ({ heatmapGrid: !prev.heatmapGrid }));
  },

  setHeatmapColormap(value) {
    const options = ["viridis", "plasma", "inferno", "magma", "cool", "hot"];
    const nextValue = options.includes(value) ? value : "viridis";
    setState({ heatmapColormap: nextValue });
  },

  };
}
  if (typeof createViewActions !== "undefined") {
    moduleState.createViewActions = createViewActions;
    global.createViewActions = createViewActions;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("state/reducers/viewActions");
  }
})(typeof window !== "undefined" ? window : globalThis);
