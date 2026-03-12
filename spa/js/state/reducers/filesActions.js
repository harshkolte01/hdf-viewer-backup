// Viewer HTML module: Handles file list loading, viewer open/reset lifecycle, and route-level file selection state.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for state/reducers/filesActions.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading state/reducers/filesActions.");
    return;
  }
  var moduleState = ensurePath(ns, "state.reducers.filesActions");

// Destructures all dependencies from the shared deps bundle for use inside action functions
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
function createFileActions(deps) {
  const {
    actions,
    getState,
    setState,
    getFiles,
    refreshFiles,
    getDisplayConfigDefaults,
  } = unpackDeps(deps);

  return {
  // Fetches the file list from the API (or frontend cache) and updates state.files
  async loadFiles() {
    setState({ loading: true, error: null });

    try {
      const data = await getFiles();
      const files = Array.isArray(data.files) ? data.files : [];

      setState((prev) => ({
        files,
        loading: false,
        cacheResponses: {
          ...prev.cacheResponses,
          files,
        },
      }));
    } catch (error) {
      setState({
        loading: false,
        error: error.message || "Failed to load files",
      });
    }
  },

  // Triggers a backend cache refresh, clears frontend caches, then reloads the file list
  async refreshFileList() {
    setState({ refreshing: true, error: null });

    try {
      await refreshFiles();
      await actions.loadFiles();
    } catch (error) {
      setState({
        error: error.message || "Failed to refresh files",
      });
    } finally {
      setState({ refreshing: false });
    }
  },

  // Sets route to "viewer", resets all per-session state to initial defaults, and starts loading the root tree node
  openViewer(fileSelection) {
    const selection =
      typeof fileSelection === "string"
        ? { key: fileSelection, etag: null }
        : fileSelection || {};

    setState({
      route: "viewer",
      viewerBlocked: false,
      selectedFile: selection.key || null,
      selectedFileEtag: selection.etag || null,
      selectedNodeType: "group",
      selectedNodeName: "/",
      selectedPath: "/",
      expandedPaths: new Set(["/"]),
      childrenCache: new Map(),
      treeLoadingPaths: new Set(),
      treeErrors: new Map(),
      metadata: null,
      metadataLoading: false,
      metadataError: null,
      preview: null,
      previewLoading: false,
      previewError: null,
      previewRequestKey: null,
      previewRequestInFlight: false,
      viewMode: "display",
      displayTab: "line",
      notation: "auto",
      lineGrid: true,
      lineAspect: "line",
      lineCompareEnabled: false,
      lineCompareItems: [],
      lineCompareStatus: null,
      heatmapGrid: true,
      heatmapColormap: "viridis",
      matrixFullEnabled: false,
      lineFullEnabled: false,
      heatmapFullEnabled: false,
      displayConfig: getDisplayConfigDefaults(),
    });

    void actions.loadTreeChildren("/");
    // Prime the sidebar metadata panel with root-level metadata as soon as a file opens.
    void actions.loadMetadata("/");
  },

  // Resets route to "home", clears all viewer state, and marks viewerBlocked to prevent dataset rendering
  goHome() {
    setState({
      route: "home",
      viewerBlocked: true,
      selectedFile: null,
      selectedFileEtag: null,
      selectedNodeType: "group",
      selectedNodeName: "/",
      selectedPath: "/",
      expandedPaths: new Set(["/"]),
      childrenCache: new Map(),
      treeLoadingPaths: new Set(),
      treeErrors: new Map(),
      metadata: null,
      metadataLoading: false,
      metadataError: null,
      preview: null,
      previewLoading: false,
      previewError: null,
      previewRequestKey: null,
      previewRequestInFlight: false,
      viewMode: "display",
      displayTab: "line",
      lineCompareEnabled: false,
      lineCompareItems: [],
      lineCompareStatus: null,
      matrixFullEnabled: false,
      lineFullEnabled: false,
      heatmapFullEnabled: false,
      displayConfig: getDisplayConfigDefaults(),
    });
  },

  setSearchQuery(searchQuery) {
    setState({ searchQuery });
  },

  setSelectedPath(path) {
    return actions.onBreadcrumbSelect(path);
  },

  };
}
  if (typeof createFileActions !== "undefined") {
    moduleState.createFileActions = createFileActions;
    global.createFileActions = createFileActions;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("state/reducers/filesActions");
  }
})(typeof window !== "undefined" ? window : globalThis);

