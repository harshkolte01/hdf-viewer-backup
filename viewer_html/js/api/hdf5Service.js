// Viewer HTML module: Implements cached HDF5 API operations for files, tree, metadata, preview, and mode-specific data fetches.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for api/hdf5Service.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading api/hdf5Service.");
    return;
  }
  var moduleState = ensurePath(ns, "api.hdf5Service");
// Frontend-side caches keep repeated navigation and redraw operations fast.
// Key design: cache keys always include file identity + dataset slice selectors.
const frontendCache = {
  files: null,
  treeChildren: new Map(),
  preview: new Map(),
  matrixBlocks: new LruCache(400),
  lineData: new LruCache(30),
  heatmapData: new LruCache(20),
  metadata: new LruCache(80),
};
// Separate maps prevent duplicate background refresh and duplicate data window calls.
const previewRefreshInFlight = new Map();
const dataRequestsInFlight = new Map();

const DEFAULT_LINE_OVERVIEW_MAX_POINTS = 5000;

function toDisplayDimsKey(displayDims) {
  if (!displayDims) {
    return "none";
  }

  if (Array.isArray(displayDims)) {
    return displayDims.join(",");
  }

  return String(displayDims);
}

function toFixedIndicesKey(fixedIndices) {
  if (typeof fixedIndices === "string") {
    return fixedIndices || "none";
  }

  if (!fixedIndices || typeof fixedIndices !== "object") {
    return "none";
  }

  return Object.entries(fixedIndices)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([dim, index]) => `${dim}=${index}`)
    .join(",") || "none";
}

function getTreeCache(fileKey) {
  if (!frontendCache.treeChildren.has(fileKey)) {
    frontendCache.treeChildren.set(fileKey, new Map());
  }
  return frontendCache.treeChildren.get(fileKey);
}

// Preview cache key must include all display knobs because any of them can change shape/data.
function getPreviewCacheKey(fileKey, path, params = {}) {
  return [
    fileKey,
    path,
    params.etag ?? "no-etag",
    toDisplayDimsKey(params.display_dims),
    toFixedIndicesKey(params.fixed_indices),
    params.max_size ?? "default",
    params.mode ?? "auto",
    params.detail ?? "full",
    params.include_stats ?? "default",
  ].join("|");
}

function getMatrixBlockCacheKey(fileKey, path, params = {}) {
  return [
    fileKey,
    path,
    params.etag ?? "no-etag",
    toDisplayDimsKey(params.display_dims),
    toFixedIndicesKey(params.fixed_indices),
    params.row_offset ?? 0,
    params.row_limit ?? 100,
    params.col_offset ?? 0,
    params.col_limit ?? 100,
    params.row_step ?? 1,
    params.col_step ?? 1,
  ].join("|");
}

function getLineCacheKey(fileKey, path, params = {}) {
  return [
    fileKey,
    path,
    params.etag ?? "no-etag",
    params.line_dim ?? "row",
    params.line_index ?? "auto",
    params.quality ?? "auto",
    params.max_points ?? DEFAULT_LINE_OVERVIEW_MAX_POINTS,
    params.line_offset ?? 0,
    params.line_limit ?? "all",
    toDisplayDimsKey(params.display_dims),
    toFixedIndicesKey(params.fixed_indices),
  ].join("|");
}

function getHeatmapCacheKey(fileKey, path, params = {}) {
  return [
    fileKey,
    path,
    params.etag ?? "no-etag",
    params.max_size ?? 512,
    params.include_stats ?? "default",
    toDisplayDimsKey(params.display_dims),
    toFixedIndicesKey(params.fixed_indices),
  ].join("|");
}

function getCancelChannel(type, fileKey, path) {
  return `${type}:${fileKey}:${path}`;
}function clearFrontendCaches() {
  frontendCache.files = null;
  frontendCache.treeChildren.clear();
  frontendCache.preview.clear();
  frontendCache.matrixBlocks.clear();
  frontendCache.lineData.clear();
  frontendCache.heatmapData.clear();
  frontendCache.metadata.clear();
  previewRefreshInFlight.clear();
  dataRequestsInFlight.clear();
}async function getFiles(options = {}) {
  const { force = false, signal } = options;

  if (!force && frontendCache.files) {
    return {
      ...frontendCache.files,
      cached: true,
      cache_source: "frontend",
    };
  }

  const payload = await apiClient.get(API_ENDPOINTS.FILES, {}, { signal });
  const normalized = assertSuccess(normalizeFilesResponse(payload), "getFiles");
  frontendCache.files = normalized;
  return normalized;
}async function refreshFiles(options = {}) {
  const { signal } = options;
  const payload = await apiClient.post(API_ENDPOINTS.FILES_REFRESH, null, {}, { signal });

  clearFrontendCaches();

  return payload;
}async function getFileChildren(key, path = "/", options = {}) {
  const { force = false, signal, etag } = options;
  const treeCache = getTreeCache(key);
  const treeCacheKey = `${path}|${etag || "no-etag"}`;

  if (!force && treeCache.has(treeCacheKey)) {
    return {
      ...treeCache.get(treeCacheKey),
      cached: true,
      cache_source: "frontend",
    };
  }

  const queryParams = { path };
  if (etag) {
    queryParams.etag = etag;
  }

  const payload = await apiClient.get(
    API_ENDPOINTS.FILE_CHILDREN(key),
    queryParams,
    {
      signal,
      cancelKey: getCancelChannel("children", key, path),
      cancelPrevious: false,
    }
  );

  const normalized = assertSuccess(normalizeChildrenResponse(payload), "getFileChildren");
  treeCache.set(treeCacheKey, normalized);
  return normalized;
}async function getFileMeta(key, path, options = {}) {
  const { force = false, signal, etag } = options;
  const cacheKey = `${key}|${path}|${etag || "no-etag"}`;

  if (!force) {
    const cached = frontendCache.metadata.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
        cache_source: "frontend",
      };
    }
  }

  const queryParams = { path };
  if (etag) {
    queryParams.etag = etag;
  }

  const payload = await apiClient.get(
    API_ENDPOINTS.FILE_META(key),
    queryParams,
    {
      signal,
      cancelKey: getCancelChannel("meta", key, path),
      cancelPrevious: false,
    }
  );

  const normalized = assertSuccess(normalizeMetaResponse(payload), "getFileMeta");
  frontendCache.metadata.set(cacheKey, normalized);
  return normalized;
}async function getFilePreview(key, path, params = {}, options = {}) {
  const {
    force = false,
    signal,
    cancelPrevious = true,
    staleWhileRefresh = false,
    onBackgroundUpdate = null,
  } = options;
  const cacheKey = getPreviewCacheKey(key, path, params);

  if (!force && frontendCache.preview.has(cacheKey)) {
    const cachedPreview = {
      ...frontendCache.preview.get(cacheKey),
      cached: true,
      cache_source: "frontend",
    };

    if (staleWhileRefresh) {
      // Return cached payload immediately, then refresh in background once per key.
      const refreshKey = cacheKey;
      if (!previewRefreshInFlight.has(refreshKey)) {
        const refreshPromise = apiClient
          .get(
            API_ENDPOINTS.FILE_PREVIEW(key),
            { path, ...params },
            {
              cancelKey: `${getCancelChannel("preview-refresh", key, path)}:${refreshKey}`,
              cancelPrevious: false,
            }
          )
          .then((payload) => {
            const normalized = assertSuccess(normalizePreviewPayload(payload), "getFilePreview(refresh)");
            frontendCache.preview.set(cacheKey, normalized);
            if (typeof onBackgroundUpdate === "function") {
              onBackgroundUpdate({
                ...normalized,
                cached: false,
                cache_source: "backend-refresh",
              });
            }
            return normalized;
          })
          .catch(() => null)
          .finally(() => {
            previewRefreshInFlight.delete(refreshKey);
          });

        previewRefreshInFlight.set(refreshKey, refreshPromise);
      }

      return {
        ...cachedPreview,
        stale: true,
      };
    }

    return cachedPreview;
  }

  const payload = await apiClient.get(
    API_ENDPOINTS.FILE_PREVIEW(key),
    { path, ...params },
    {
      signal,
      cancelKey: getCancelChannel("preview", key, path),
      cancelPrevious,
    }
  );

  const normalized = assertSuccess(normalizePreviewPayload(payload), "getFilePreview");
  frontendCache.preview.set(cacheKey, normalized);
  return normalized;
}

async function getMatrixData(key, path, params, options) {
  const { force = false, signal, cancelPrevious = false, cancelKey } = options;
  const cacheKey = getMatrixBlockCacheKey(key, path, params);

  if (!force) {
    const cached = frontendCache.matrixBlocks.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
        cache_source: "frontend",
      };
    }

    // Reuse the same promise when multiple consumers ask for the same block concurrently.
    const pendingRequest = dataRequestsInFlight.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest;
    }
  }

  let requestPromise;
  requestPromise = apiClient
    .get(
      API_ENDPOINTS.FILE_DATA(key),
      { path, mode: "matrix", ...params },
      {
        signal,
        cancelKey:
          cancelKey ||
          `${getCancelChannel("matrix", key, path)}:${params.row_offset ?? 0}:${params.col_offset ?? 0}`,
        cancelPrevious,
      }
    )
    .then((payload) => {
      const normalized = assertSuccess(normalizeDataPayload(payload), "getFileData(matrix)");
      frontendCache.matrixBlocks.set(cacheKey, normalized);
      return normalized;
    })
    .finally(() => {
      if (dataRequestsInFlight.get(cacheKey) === requestPromise) {
        dataRequestsInFlight.delete(cacheKey);
      }
    });

  if (!force) {
    dataRequestsInFlight.set(cacheKey, requestPromise);
  }
  return requestPromise;
}

async function getLineData(key, path, params, options) {
  const { force = false, signal, cancelPrevious = true, cancelKey } = options;
  const cacheKey = getLineCacheKey(key, path, params);

  if (!force) {
    const cached = frontendCache.lineData.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
        cache_source: "frontend",
      };
    }

    // Reuse in-flight line window request so pan/zoom bursts do not duplicate calls.
    const pendingRequest = dataRequestsInFlight.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest;
    }
  }

  let requestPromise;
  requestPromise = apiClient
    .get(
      API_ENDPOINTS.FILE_DATA(key),
      { path, mode: "line", ...params },
      {
        signal,
        cancelKey: cancelKey || getCancelChannel("line", key, path),
        cancelPrevious,
      }
    )
    .then((payload) => {
      const normalized = assertSuccess(normalizeDataPayload(payload), "getFileData(line)");
      frontendCache.lineData.set(cacheKey, normalized);
      return normalized;
    })
    .finally(() => {
      if (dataRequestsInFlight.get(cacheKey) === requestPromise) {
        dataRequestsInFlight.delete(cacheKey);
      }
    });

  if (!force) {
    dataRequestsInFlight.set(cacheKey, requestPromise);
  }
  return requestPromise;
}

async function getHeatmapData(key, path, params, options) {
  const { force = false, signal, cancelPrevious = true, cancelKey } = options;
  const cacheKey = getHeatmapCacheKey(key, path, params);

  if (!force) {
    const cached = frontendCache.heatmapData.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
        cache_source: "frontend",
      };
    }

    // Reuse in-flight heatmap request for identical params.
    const pendingRequest = dataRequestsInFlight.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest;
    }
  }

  let requestPromise;
  requestPromise = apiClient
    .get(
      API_ENDPOINTS.FILE_DATA(key),
      { path, mode: "heatmap", ...params },
      {
        signal,
        cancelKey: cancelKey || getCancelChannel("heatmap", key, path),
        cancelPrevious,
      }
    )
    .then((payload) => {
      const normalized = assertSuccess(normalizeDataPayload(payload), "getFileData(heatmap)");
      frontendCache.heatmapData.set(cacheKey, normalized);
      return normalized;
    })
    .finally(() => {
      if (dataRequestsInFlight.get(cacheKey) === requestPromise) {
        dataRequestsInFlight.delete(cacheKey);
      }
    });

  if (!force) {
    dataRequestsInFlight.set(cacheKey, requestPromise);
  }
  return requestPromise;
}async function getFileData(key, path, params = {}, options = {}) {
  const mode = String(params.mode || "").toLowerCase();

  if (mode === "matrix") {
    return getMatrixData(key, path, params, options);
  }

  if (mode === "line") {
    return getLineData(key, path, params, options);
  }

  if (mode === "heatmap") {
    return getHeatmapData(key, path, params, options);
  }

  throw new Error("Invalid mode. Expected one of: matrix, line, heatmap");
}const __default_export__ = {
  getFiles,
  refreshFiles,
  getFileChildren,
  getFileMeta,
  getFilePreview,
  getFileData,
  clearFrontendCaches,
};
  if (typeof clearFrontendCaches !== "undefined") {
    moduleState.clearFrontendCaches = clearFrontendCaches;
    global.clearFrontendCaches = clearFrontendCaches;
  }
  if (typeof getFiles !== "undefined") {
    moduleState.getFiles = getFiles;
    global.getFiles = getFiles;
  }
  if (typeof refreshFiles !== "undefined") {
    moduleState.refreshFiles = refreshFiles;
    global.refreshFiles = refreshFiles;
  }
  if (typeof getFileChildren !== "undefined") {
    moduleState.getFileChildren = getFileChildren;
    global.getFileChildren = getFileChildren;
  }
  if (typeof getFileMeta !== "undefined") {
    moduleState.getFileMeta = getFileMeta;
    global.getFileMeta = getFileMeta;
  }
  if (typeof getFilePreview !== "undefined") {
    moduleState.getFilePreview = getFilePreview;
    global.getFilePreview = getFilePreview;
  }
  if (typeof getFileData !== "undefined") {
    moduleState.getFileData = getFileData;
    global.getFileData = getFileData;
  }
  if (typeof __default_export__ !== "undefined") {
    moduleState.defaultService = __default_export__;
    global.__hdf5ServiceDefault = __default_export__;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("api/hdf5Service");
  }
})(typeof window !== "undefined" ? window : globalThis);

