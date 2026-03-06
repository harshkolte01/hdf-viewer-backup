// Viewer HTML module: Loads metadata and preview data with dedupe, stale-update safety, and warmed preview selection logic.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for state/reducers/dataActions.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading state/reducers/dataActions.");
    return;
  }
  var moduleState = ensurePath(ns, "state.reducers.dataActions");
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
}function createDataActions(deps) {
  const {
    getState,
    setState,
    getFileMeta,
    getFilePreview,
    getDisplayConfigDefaults,
    normalizePath,
    normalizeShape,
    getDefaultDisplayDims,
    normalizeDisplayDimsForShape,
    normalizeFixedIndicesForShape,
    buildNextFixedIndices,
    buildDisplayDimsParam,
    buildFixedIndicesParam,
    areDisplayDimsEqual,
    areFixedIndicesEqual,
  } = unpackDeps(deps);

  // First paint is intentionally lighter; repeated views can ask for a denser preview.
  const PREVIEW_MAX_SIZE_FIRST = 160;
  const PREVIEW_MAX_SIZE_STEADY = 256;
  const PREVIEW_DETAIL = "fast";
  // Request-key promise dedupe avoids duplicate network calls during quick UI churn.
  const previewRequestPromises = new Map();
  // Tracks selections that already received at least one preview response.
  const warmedPreviewSelections = new Set();

  function resolvePreviewMode(displayTab) {
    if (displayTab === "line") {
      return "line";
    }
    if (displayTab === "heatmap") {
      return "heatmap";
    }
    return "table";
  }

  function buildPreviewSelectionKey(
    fileKey,
    path,
    mode,
    displayDimsParam,
    fixedIndicesParam,
    etag,
    maxSize,
    detail
  ) {
    return [
      fileKey || "no-file",
      path || "/",
      mode || "auto",
      displayDimsParam || "none",
      fixedIndicesParam || "none",
      etag || "no-etag",
      maxSize ?? "default",
      detail || "full",
    ].join("|");
  }

  function buildWarmSelectionKey(fileKey, path, mode, displayDimsParam, fixedIndicesParam, etag, detail) {
    return [
      fileKey || "no-file",
      path || "/",
      mode || "auto",
      displayDimsParam || "none",
      fixedIndicesParam || "none",
      etag || "no-etag",
      detail || "full",
    ].join("|");
  }

  function applyPreviewResponse(latest, targetPath, response, requestKey) {
    // Keep staged/applied display config valid for the current shape after each preview response.
    const shape = normalizeShape(response?.shape);
    const prevConfig = latest.displayConfig || getDisplayConfigDefaults();

    const nextAppliedDims =
      normalizeDisplayDimsForShape(prevConfig.displayDims, shape) ||
      normalizeDisplayDimsForShape(response?.display_dims, shape) ||
      getDefaultDisplayDims(shape);

    const currentAppliedFixed = normalizeFixedIndicesForShape(
      prevConfig.fixedIndices,
      shape,
      nextAppliedDims || []
    );
    const responseFixed = normalizeFixedIndicesForShape(
      response?.fixed_indices,
      shape,
      nextAppliedDims || []
    );
    const baseAppliedFixed =
      Object.keys(currentAppliedFixed).length > 0 ? currentAppliedFixed : responseFixed;
    const nextAppliedFixed = buildNextFixedIndices(baseAppliedFixed, nextAppliedDims || [], shape);

    const nextStagedDims =
      normalizeDisplayDimsForShape(prevConfig.stagedDisplayDims, shape) || nextAppliedDims;
    const stagedPendingDims = !areDisplayDimsEqual(nextStagedDims, nextAppliedDims);
    const currentStagedFixed = normalizeFixedIndicesForShape(
      prevConfig.stagedFixedIndices,
      shape,
      nextStagedDims || []
    );
    const stagedPendingFixed = !areFixedIndicesEqual(currentStagedFixed, nextAppliedFixed);
    const nextStagedFixed = buildNextFixedIndices(
      (stagedPendingDims || stagedPendingFixed) && Object.keys(currentStagedFixed).length > 0
        ? currentStagedFixed
        : nextAppliedFixed,
      nextStagedDims || [],
      shape
    );

    setState((prev) => ({
      preview: response,
      previewLoading: false,
      previewError: null,
      previewRequestKey: requestKey,
      previewRequestInFlight: false,
      displayConfig: {
        ...(prev.displayConfig || getDisplayConfigDefaults()),
        displayDims: nextAppliedDims,
        fixedIndices: nextAppliedFixed,
        stagedDisplayDims: nextStagedDims,
        stagedFixedIndices: nextStagedFixed,
      },
      cacheResponses: {
        ...prev.cacheResponses,
        preview: {
          ...(prev.cacheResponses?.preview || {}),
          [targetPath]: response,
        },
      },
    }));
  }

  return {
  async loadMetadata(path = null) {
    const snapshot = getState();
    const targetPath = normalizePath(path || snapshot.selectedPath);

    if (!snapshot.selectedFile) {
      return null;
    }

    setState({
      metadataLoading: true,
      metadataError: null,
    });

    try {
      const response = await getFileMeta(snapshot.selectedFile, targetPath, {
        etag: snapshot.selectedFileEtag || undefined,
      });
      const metadata = response.metadata || null;
      const latest = getState();

      if (
        latest.selectedFile === snapshot.selectedFile &&
        latest.selectedPath === targetPath &&
        latest.viewMode === "inspect"
      ) {
        setState((prev) => ({
          metadata,
          metadataLoading: false,
          metadataError: null,
          cacheResponses: {
            ...prev.cacheResponses,
            meta: {
              ...(prev.cacheResponses?.meta || {}),
              [targetPath]: metadata,
            },
          },
        }));
      }

      return metadata;
    } catch (error) {
      const latest = getState();
      if (
        latest.selectedFile === snapshot.selectedFile &&
        latest.selectedPath === targetPath &&
        latest.viewMode === "inspect"
      ) {
        setState({
          metadataLoading: false,
          metadataError: error.message || "Failed to load metadata",
        });
      }

      throw error;
    }
  },

  async loadPreview(path = null) {
    const snapshot = getState();
    const targetPath = normalizePath(path || snapshot.selectedPath);

    if (!snapshot.selectedFile) {
      return null;
    }

    const displayDimsParam = buildDisplayDimsParam(snapshot.displayConfig?.displayDims);
    const fixedIndicesParam = buildFixedIndicesParam(snapshot.displayConfig?.fixedIndices);
    const mode = resolvePreviewMode(snapshot.displayTab);
    const selectedFileEtag = snapshot.selectedFileEtag || null;
    const warmSelectionKey = buildWarmSelectionKey(
      snapshot.selectedFile,
      targetPath,
      mode,
      displayDimsParam,
      fixedIndicesParam,
      selectedFileEtag,
      PREVIEW_DETAIL
    );
    const maxSize = warmedPreviewSelections.has(warmSelectionKey)
      ? PREVIEW_MAX_SIZE_STEADY
      : PREVIEW_MAX_SIZE_FIRST;
    const previewParams = {
      mode,
      max_size: maxSize,
      detail: PREVIEW_DETAIL,
      include_stats: 0,
    };

    if (displayDimsParam) {
      previewParams.display_dims = displayDimsParam;
    }

    if (fixedIndicesParam) {
      previewParams.fixed_indices = fixedIndicesParam;
    }

    if (selectedFileEtag) {
      previewParams.etag = selectedFileEtag;
    }

    const requestKey = buildPreviewSelectionKey(
      snapshot.selectedFile,
      targetPath,
      mode,
      displayDimsParam,
      fixedIndicesParam,
      selectedFileEtag,
      maxSize,
      PREVIEW_DETAIL
    );

    if (snapshot.preview && snapshot.previewRequestKey === requestKey && !snapshot.previewError) {
      return snapshot.preview;
    }

    const existingPromise = previewRequestPromises.get(requestKey);
    if (existingPromise) {
      return existingPromise;
    }

    const hasMatchingPreview = snapshot.preview && snapshot.previewRequestKey === requestKey;

    setState({
      previewLoading: !hasMatchingPreview,
      previewError: null,
      previewRequestKey: requestKey,
      previewRequestInFlight: true,
      matrixFullEnabled: false,
      lineFullEnabled: false,
      heatmapFullEnabled: false,
    });

    let requestPromise;
    requestPromise = (async () => {
      try {
        const response = await getFilePreview(snapshot.selectedFile, targetPath, previewParams, {
          cancelPrevious: true,
          staleWhileRefresh: true,
          onBackgroundUpdate: (freshResponse) => {
            // Background refresh can finish after navigation; only apply if selection is still current.
            const latest = getState();
            const canApplyBackground =
              latest.selectedFile === snapshot.selectedFile &&
              latest.selectedPath === targetPath &&
              latest.viewMode === "display" &&
              latest.previewRequestKey === requestKey;

            if (canApplyBackground) {
              warmedPreviewSelections.add(warmSelectionKey);
              applyPreviewResponse(latest, targetPath, freshResponse, requestKey);
            }
          },
        });
        const latest = getState();

        // Main-response stale guard: prevents old requests from overwriting a newer selection.
        if (
          latest.selectedFile === snapshot.selectedFile &&
          latest.selectedPath === targetPath &&
          latest.viewMode === "display" &&
          latest.previewRequestKey === requestKey
        ) {
          warmedPreviewSelections.add(warmSelectionKey);
          applyPreviewResponse(latest, targetPath, response, requestKey);
        }

        return response;
      } catch (error) {
        const latest = getState();
        if (
          latest.selectedFile === snapshot.selectedFile &&
          latest.selectedPath === targetPath &&
          latest.viewMode === "display" &&
          latest.previewRequestKey === requestKey
        ) {
          setState({
            previewLoading: false,
            previewRequestInFlight: false,
            previewError:
              error?.isAbort || error?.code === "ABORTED"
                ? null
                : error.message || "Failed to load preview",
          });
        }

        if (error?.isAbort || error?.code === "ABORTED") {
          return null;
        }

        throw error;
      } finally {
        if (previewRequestPromises.get(requestKey) === requestPromise) {
          previewRequestPromises.delete(requestKey);
        }
      }
    })();

    previewRequestPromises.set(requestKey, requestPromise);
    return requestPromise;
  },
  };
}
  if (typeof createDataActions !== "undefined") {
    moduleState.createDataActions = createDataActions;
    global.createDataActions = createDataActions;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("state/reducers/dataActions");
  }
})(typeof window !== "undefined" ? window : globalThis);
