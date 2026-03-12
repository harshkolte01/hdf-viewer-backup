// Viewer HTML module: Handles tree expand/select/breadcrumb interactions and lazy child loading behavior.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for state/reducers/treeActions.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading state/reducers/treeActions.");
    return;
  }
  var moduleState = ensurePath(ns, "state.reducers.treeActions");

// Destructures all needed dependencies from the shared deps bundle
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
function createTreeActions(deps) {
  const {
    actions,
    getState,
    setState,
    getFileChildren,
    normalizePath,
    getAncestorPaths,
    getNodeName,
    getDisplayConfigDefaults,
  } = unpackDeps(deps);

  return {
  // Handles navigation via the breadcrumb bar: expands ancestor paths, clears preview state, and loads children
  onBreadcrumbSelect(path) {
    const normalizedPath = normalizePath(path);
    const requiredAncestors = getAncestorPaths(normalizedPath);
    const snapshot = getState();
    const preserveDatasetSelection =
      snapshot.selectedNodeType === "dataset" &&
      snapshot.selectedPath === normalizedPath;

    setState((prev) => {
      const expanded = new Set(prev.expandedPaths || ["/"]);
      requiredAncestors.forEach((entry) => expanded.add(entry));

      if (preserveDatasetSelection) {
        return {
          selectedPath: normalizedPath,
          selectedNodeType: "dataset",
          selectedNodeName: getNodeName(normalizedPath, prev.selectedNodeName || ""),
          expandedPaths: expanded,
        };
      }

      return {
        selectedPath: normalizedPath,
        selectedNodeType: "group",
        selectedNodeName: getNodeName(normalizedPath),
        expandedPaths: expanded,
        matrixFullEnabled: false,
        lineFullEnabled: false,
        heatmapFullEnabled: false,
        displayConfig: getDisplayConfigDefaults(),
        metadata: null,
        metadataLoading: false,
        metadataError: null,
        preview: null,
        previewLoading: false,
        previewError: null,
        previewRequestKey: null,
        previewRequestInFlight: false,
        lineCompareItems: [],
        lineCompareStatus: null,
      };
    });

    if (!preserveDatasetSelection) {
      void actions.loadTreeChildren(normalizedPath);
    }

    const current = getState();
    if (current.route === "viewer") {
      // Breadcrumb navigation should update sidebar metadata even when the main panel stays in display mode.
      void actions.loadMetadata(normalizedPath);
    }
  },

  // Lazily loads children for a tree path; uses the childrenCache Map to avoid refetching on re-expand
  async loadTreeChildren(path, options = {}) {
    const normalizedPath = normalizePath(path);
    const { force = false } = options;
    const snapshot = getState();

    if (!snapshot.selectedFile) {
      return [];
    }

    if (!force && snapshot.childrenCache instanceof Map && snapshot.childrenCache.has(normalizedPath)) {
      return snapshot.childrenCache.get(normalizedPath) || [];
    }

    setState((prev) => {
      const treeLoadingPaths = new Set(prev.treeLoadingPaths || []);
      treeLoadingPaths.add(normalizedPath);

      const treeErrors = new Map(prev.treeErrors || []);
      treeErrors.delete(normalizedPath);

      return {
        treeLoadingPaths,
        treeErrors,
      };
    });

    try {
      const response = await getFileChildren(snapshot.selectedFile, normalizedPath, {
        force,
        etag: snapshot.selectedFileEtag || undefined,
      });
      const children = Array.isArray(response.children) ? response.children : [];

      setState((prev) => {
        const childrenCache = new Map(prev.childrenCache || []);
        childrenCache.set(normalizedPath, children);

        const treeLoadingPaths = new Set(prev.treeLoadingPaths || []);
        treeLoadingPaths.delete(normalizedPath);

        return {
          childrenCache,
          treeLoadingPaths,
        };
      });

      return children;
    } catch (error) {
      setState((prev) => {
        const treeLoadingPaths = new Set(prev.treeLoadingPaths || []);
        treeLoadingPaths.delete(normalizedPath);

        const treeErrors = new Map(prev.treeErrors || []);
        treeErrors.set(normalizedPath, error.message || "Failed to load tree node");

        return {
          treeLoadingPaths,
          treeErrors,
        };
      });

      throw error;
    }
  },

  toggleTreePath(path) {
    const normalizedPath = normalizePath(path);
    let shouldExpand = false;

    setState((prev) => {
      const expandedPaths = new Set(prev.expandedPaths || ["/"]);

      if (normalizedPath === "/") {
        expandedPaths.add("/");
        shouldExpand = true;
      } else if (expandedPaths.has(normalizedPath)) {
        expandedPaths.delete(normalizedPath);
      } else {
        expandedPaths.add(normalizedPath);
        shouldExpand = true;
      }

      return { expandedPaths };
    });

    if (shouldExpand) {
      void actions.loadTreeChildren(normalizedPath);
    }
  },

  selectTreeNode(node) {
    const normalizedPath = normalizePath(node.path || "/");
    const nodeType = node.type === "dataset" ? "dataset" : "group";
    const nodeName = getNodeName(normalizedPath, node.name || "");
    const requiredAncestors = getAncestorPaths(normalizedPath);

    setState((prev) => {
      const expandedPaths = new Set(prev.expandedPaths || ["/"]);
      requiredAncestors.forEach((entry) => expandedPaths.add(entry));
      const datasetBaseChanged =
        nodeType === "dataset" && normalizePath(prev.selectedPath || "/") !== normalizedPath;

      return {
        selectedPath: normalizedPath,
        selectedNodeType: nodeType,
        selectedNodeName: nodeName,
        expandedPaths,
        matrixFullEnabled: false,
        lineFullEnabled: false,
        heatmapFullEnabled: false,
        ...(datasetBaseChanged
          ? {
              lineCompareItems: [],
              lineCompareStatus: null,
            }
          : {}),
        ...(nodeType === "dataset" ? { displayConfig: getDisplayConfigDefaults() } : {}),
        ...(nodeType === "group"
          ? {
              displayConfig: getDisplayConfigDefaults(),
              metadata: null,
              metadataLoading: false,
              metadataError: null,
              preview: null,
              previewLoading: false,
              previewError: null,
              previewRequestKey: null,
              previewRequestInFlight: false,
              lineCompareItems: [],
              lineCompareStatus: null,
            }
          : {}),
      };
    });

    const current = getState();
    if (nodeType === "group") {
      void actions.loadTreeChildren(normalizedPath);
      // Groups only affect the tree + sidebar metadata panel.
      void actions.loadMetadata(normalizedPath);
      return;
    }

    // Datasets drive both sidebar metadata and the main display preview.
    void actions.loadMetadata(normalizedPath);
    if (current.viewMode === "display") {
      void actions.loadPreview(normalizedPath);
    }
  },

  };
}
  if (typeof createTreeActions !== "undefined") {
    moduleState.createTreeActions = createTreeActions;
    global.createTreeActions = createTreeActions;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("state/reducers/treeActions");
  }
})(typeof window !== "undefined" ? window : globalThis);
