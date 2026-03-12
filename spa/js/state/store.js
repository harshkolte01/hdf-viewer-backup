// Viewer HTML module: Defines the mutable global viewer state object with subscribe and setState update hooks.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for state/store.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading state/store.");
    return;
  }
  var moduleState = ensurePath(ns, "state.store");

// Single mutable state object — the entire UI is derived from this.
// Mutated only via setState(); reads via getState().
const state = {
  // Current page route: 'home' shows file list, 'viewer' shows the HDF5 file viewer
  route: "home",
  // Blocks viewer render until a file is loaded via deep-link or user selection
  viewerBlocked: true,

  // --- File list ---
  files: [],
  loading: false,
  error: null,
  refreshing: false,
  searchQuery: "",

  // --- Selected file ---
  selectedFile: null,       // object key of the HDF5 file being viewed
  selectedFileEtag: null,   // ETag used to detect file changes for cache validation

  // --- Selected HDF5 node in the tree ---
  selectedNodeType: "group",
  selectedNodeName: "/",
  selectedPath: "/",

  // --- Tree state ---
  expandedPaths: new Set(["/"]),    // Set of paths with open group nodes
  childrenCache: new Map(),          // path -> TreeNode[] for loaded group children
  treeLoadingPaths: new Set(),       // paths currently loading children
  treeErrors: new Map(),             // path -> error message for failed child loads

  // --- Panel view mode ---
  viewMode: "display",              // SPA shell keeps the main area on display; metadata now lives in the sidebar

  // --- Metadata and preview data ---
  metadata: null,
  metadataLoading: false,
  metadataError: null,
  preview: null,
  previewLoading: false,
  previewError: null,
  previewRequestKey: null,           // unique key stamped onto the latest preview request to detect stale responses
  previewRequestInFlight: false,

  // --- Display mode sub-tab ---
  displayTab: "line",               // active tab: 'line', 'heatmap', or 'matrix'

  // --- Per-view display preferences ---
  notation: "auto",                 // numeric notation for matrix cells: 'auto', 'fixed', or 'sci'
  lineGrid: true,
  lineAspect: "line",
  lineCompareEnabled: false,         // whether the compare overlay is active in line mode
  lineCompareItems: [],              // array of { path, name, dtype, ndim, shape } compare entries
  lineCompareStatus: null,
  heatmapGrid: true,
  heatmapColormap: "viridis",       // colormap name for heatmap: viridis, plasma, inferno, etc.

  // --- Full-view enable flags ---
  // When false, only the fast preview is shown; setting to true activates the interactive runtime
  matrixFullEnabled: false,
  lineFullEnabled: false,
  heatmapFullEnabled: false,

  // --- Matrix block streaming config ---
  matrixBlockSize: {
    rows: 160,   // number of data rows per streamed block request
    cols: 40,    // number of data columns per streamed block request
  },

  // --- Dimension config for 3D+ datasets ---
  // displayDims: which two dimensions map to the XY axes (e.g. [0, 1])
  // fixedIndices: slice index for each non-displayed dimension (e.g. { 2: 5 })
  // staged* = pending user selection not yet applied; applied after clicking "Apply"
  displayConfig: {
    displayDims: null,
    fixedIndices: {},
    stagedDisplayDims: null,
    stagedFixedIndices: {},
  },

  // --- Cache response snapshots (informational only, not used for rendering) ---
  cacheResponses: {
    files: [],
    children: {},
    meta: {},
    preview: {},
    data: {},
  },

  // --- Which renderer implementation to use per view type ---
  rendererPlan: {
    line: "svg",                  // line chart uses inline SVG
    heatmap: "canvas",            // heatmap uses Canvas 2D API
    matrix: "block-rendering",    // matrix uses virtual block streaming
  },

  // Whether the sidebar is expanded
  sidebarOpen: true,
};

// Subscriber set — all listeners are called after every setState call
const listeners = new Set();

// Returns the current state object by reference (do not mutate directly)
function getState() {
  return state;
}

// Merges a patch or the result of an updater function into state,
// then notifies all subscribers so the UI can re-render.
function setState(updater) {
  const patch = typeof updater === "function" ? updater(state) : updater;
  if (!patch || typeof patch !== "object") {
    return;
  }

  Object.assign(state, patch);
  listeners.forEach((listener) => listener(state));
}

// Registers a listener to be called after each setState; returns an unsubscribe function
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
  if (typeof state !== "undefined") {
    moduleState.state = state;
    global.state = state;
  }
  if (typeof getState !== "undefined") {
    moduleState.getState = getState;
    global.getState = getState;
  }
  if (typeof setState !== "undefined") {
    moduleState.setState = setState;
    global.setState = setState;
  }
  if (typeof subscribe !== "undefined") {
    moduleState.subscribe = subscribe;
    global.subscribe = subscribe;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("state/store");
  }
})(typeof window !== "undefined" ? window : globalThis);

