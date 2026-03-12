// Viewer HTML module: Renders the lazy tree sidebar and delegates tree selection, retry, toggle, and compare-add events.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for components/sidebarTree.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading components/sidebarTree.");
    return;
  }
  var moduleState = ensurePath(ns, "components.sidebarTree");

// Returns the cached children array for a path, or null if not yet loaded
function getChildren(state, path) {
  if (!(state.childrenCache instanceof Map)) {
    return null;
  }
  return state.childrenCache.has(path) ? state.childrenCache.get(path) : null;
}

function hasPath(state, path) {
  return state.childrenCache instanceof Map && state.childrenCache.has(path);
}

function isExpanded(state, path) {
  return state.expandedPaths instanceof Set && state.expandedPaths.has(path);
}

function isLoading(state, path) {
  return state.treeLoadingPaths instanceof Set && state.treeLoadingPaths.has(path);
}

function getError(state, path) {
  if (!(state.treeErrors instanceof Map)) {
    return null;
  }
  return state.treeErrors.get(path) || null;
}

function normalizePath(path) {
  if (!path || path === "/") {
    return "/";
  }
  const normalized = `/${String(path).replace(/^\/+/, "").replace(/\/+/g, "/")}`;
  return normalized.endsWith("/") && normalized.length > 1
    ? normalized.slice(0, -1)
    : normalized;
}

function normalizeShape(shape) {
  if (!Array.isArray(shape)) {
    return [];
  }
  return shape
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);
}

// Checks whether a string dtype indicates a numeric type suitable for line chart plotting
function isNumericDtype(dtype) {
  const normalized = String(dtype || "").trim().toLowerCase();
  if (!normalized || normalized.includes("complex")) {
    return false;
  }
  return (
    normalized.includes("float") ||
    normalized.includes("int") ||
    normalized.includes("uint") ||
    normalized.includes("bool")
  );
}

// Searches all cached children arrays to find a dataset node matching the given path
// Used when the preview object is not yet available to determine compare-add eligibility
function lookupDatasetFromCache(state, targetPath) {
  const normalizedTargetPath = normalizePath(targetPath);
  if (!(state.childrenCache instanceof Map)) {
    return null;
  }

  for (const children of state.childrenCache.values()) {
    if (!Array.isArray(children)) {
      continue;
    }

    const hit = children.find((entry) => {
      return entry?.type === "dataset" && normalizePath(entry?.path || "/") === normalizedTargetPath;
    });

    if (hit) {
      return {
        path: normalizePath(hit.path || normalizedTargetPath),
        dtype: String(hit.dtype || ""),
        shape: normalizeShape(hit.shape),
        ndim: Number(hit.ndim),
      };
    }
  }

  return null;
}

function getBaseDatasetForCompare(state) {
  const selectedPath = normalizePath(state.selectedPath || "/");
  if (selectedPath === "/") {
    return null;
  }

  const preview =
    state.preview && normalizePath(state.preview.path || "/") === selectedPath ? state.preview : null;
  if (preview) {
    const shape = normalizeShape(preview.shape);
    const ndim = Number.isFinite(Number(preview.ndim)) ? Number(preview.ndim) : shape.length;
    return {
      path: selectedPath,
      dtype: String(preview.dtype || ""),
      shape,
      ndim,
    };
  }

  return lookupDatasetFromCache(state, selectedPath);
}

function shapesMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => Number(entry) === Number(right[index]));
}

function isDatasetCompatibleWithBase(baseDataset, candidateDataset) {
  if (!baseDataset || !candidateDataset) {
    return false;
  }
  if (!isNumericDtype(baseDataset.dtype) || !isNumericDtype(candidateDataset.dtype)) {
    return false;
  }
  if (!Number.isFinite(baseDataset.ndim) || !Number.isFinite(candidateDataset.ndim)) {
    return false;
  }
  if (baseDataset.ndim !== candidateDataset.ndim) {
    return false;
  }
  return shapesMatch(baseDataset.shape, candidateDataset.shape);
}

function renderStatus(state, path) {
  const loading = isLoading(state, path);
  const error = getError(state, path);

  if (loading) {
    return '<li class="tree-status">Loading...</li>';
  }

  if (error) {
    return `
      <li class="tree-status error">
        <span>${escapeHtml(error)}</span>
        <button class="tree-retry-btn" data-tree-retry-path="${escapeHtml(path)}" type="button">Retry</button>
      </li>
    `;
  }

  if (hasPath(state, path)) {
    const children = getChildren(state, path) || [];
    if (!children.length) {
      return '<li class="tree-status">No items</li>';
    }
  }

  return "";
}

function renderNode(node, state, compareContext = null) {
  const path = normalizePath(node.path || "/");
  const nodeType = node.type === "dataset" ? "dataset" : "group";
  const name = node.name || (path === "/" ? state.selectedFile || "root" : path.split("/").filter(Boolean).pop());
  const selected = state.selectedPath === path ? "active" : "";
  const expanded = nodeType === "group" && isExpanded(state, path);
  const loaded = nodeType === "group" && hasPath(state, path);
  const caretClass = [
    "tree-caret",
    nodeType === "group" ? "" : "is-leaf",
    expanded ? "is-open" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const iconClass = nodeType === "group" ? "tree-icon is-group" : "tree-icon is-dataset";
  const count = Number(node.num_children) || 0;
  const compareMode = Boolean(compareContext?.enabled) && nodeType === "dataset";
  const candidateDataset = compareMode
    ? {
        path,
        dtype: String(node.dtype || ""),
        shape: normalizeShape(node.shape),
        ndim: Number(node.ndim),
      }
    : null;
  const comparePathSet = compareContext?.pathSet || new Set();
  const alreadyCompared = comparePathSet.has(path);
  const isBaseDataset = nodeType === "dataset" && state.selectedPath === path;
  const isCompatibleCandidate =
    compareMode && !isBaseDataset
      ? isDatasetCompatibleWithBase(compareContext?.baseDataset || null, candidateDataset)
      : false;
  const showCompareControl = compareMode && (isBaseDataset || alreadyCompared || isCompatibleCandidate);
  const compareButtonLabel = isBaseDataset ? "Base" : alreadyCompared ? "Added" : "Compare";
  const compareShape = Array.isArray(candidateDataset?.shape) ? candidateDataset.shape.join(",") : "";
  const compareDtype = node.dtype || "";
  const compareNdim = Number.isFinite(Number(candidateDataset?.ndim))
    ? Number(candidateDataset.ndim)
    : "";

  return `
    <li class="tree-node">
      <div class="tree-row-wrap">
        <button class="tree-row ${selected}" type="button"
            data-tree-select-path="${escapeHtml(path)}"
            data-tree-select-type="${escapeHtml(nodeType)}"
            data-tree-select-name="${escapeHtml(name)}"
          >
            ${
              nodeType === "group"
                ? `<span class="${caretClass}" data-tree-toggle-path="${escapeHtml(path)}"></span>`
                : `<span class="${caretClass}"></span>`
            }
            <span class="${iconClass}" aria-hidden="true"></span>
            <span class="tree-label">${escapeHtml(name)}</span>
            ${nodeType === "group" && count > 0 ? `<span class="tree-count">${count}</span>` : ""}
        </button>
        ${
          showCompareControl
            ? `<button
                  type="button"
                  class="tree-compare-btn ${isBaseDataset || alreadyCompared ? "is-disabled" : ""}"
                  data-tree-compare-add-path="${escapeHtml(path)}"
                  data-tree-compare-add-name="${escapeHtml(name)}"
                  data-tree-compare-add-type="${escapeHtml(nodeType)}"
                  data-tree-compare-add-dtype="${escapeHtml(compareDtype)}"
                  data-tree-compare-add-shape="${escapeHtml(compareShape)}"
                  data-tree-compare-add-ndim="${escapeHtml(compareNdim)}"
                  title="${
                    isBaseDataset
                      ? "Base dataset currently plotted"
                      : alreadyCompared
                      ? "Already added to comparison"
                      : "Add dataset to line comparison"
                  }"
                  ${isBaseDataset || alreadyCompared ? "disabled" : ""}
                >${compareButtonLabel}</button>`
            : ""
        }
      </div>
        ${
          nodeType === "group" && expanded
            ? `<ul class="tree-branch">${
                loaded
                  ? (getChildren(state, path) || [])
                      .map((child) => renderNode(child, state, compareContext))
                      .join("")
                  : ""
              }${renderStatus(state, path)}</ul>`
            : ""
        }
    </li>
  `;
}

function renderSidebarMetadata(state) {
  // Reuse the shared metadata markup so the sidebar stays aligned with the
  // metadata formatting logic already maintained in viewerPanel/render/sections.js.
  const fallback = `
    <div class="sidebar-metadata-panel">
      <div class="panel-state">
        <div class="state-text">Metadata panel is unavailable.</div>
      </div>
    </div>
  `;

  const content =
    typeof renderMetadataPanelContent === "function"
      ? renderMetadataPanelContent(state, { wrapperClass: "sidebar-metadata-content" })
      : fallback;

  return `
    <div id="metadata-panel" class="sidebar-section sidebar-section-metadata">
      <div class="section-label">Metadata</div>
      <div class="sidebar-panel-scroll sidebar-metadata-scroll">
        <div class="sidebar-metadata-panel">
          ${content}
        </div>
      </div>
    </div>
  `;
}

function renderSidebarTree(state) {
  const treeRoot = {
    type: "group",
    name: state.selectedFile || "root",
    path: "/",
    num_children: (getChildren(state, "/") || []).length,
  };
  const compareTreeScrollEnabled =
    state.route === "viewer" &&
    state.viewMode === "display" &&
    state.displayTab === "line" &&
    state.lineCompareEnabled === true;
  const compareItems = Array.isArray(state.lineCompareItems) ? state.lineCompareItems : [];
  const comparePathSet = new Set(
    compareItems.map((entry) => normalizePath(entry?.path || "/"))
  );
  const compareContext = {
    enabled: compareTreeScrollEnabled,
    baseDataset: compareTreeScrollEnabled ? getBaseDatasetForCompare(state) : null,
    pathSet: comparePathSet,
  };

  return `
    <aside id="viewer-sidebar" class="viewer-sidebar">
      <div id="sidebar-header" class="sidebar-top">
        <div class="sidebar-top-row">
          <div class="sidebar-title">${state.selectedFile ? escapeHtml(state.selectedFile.split('/').pop()) : "HDF Viewer"}</div>
          <button class="sidebar-close-btn" id="sidebar-close-btn" type="button" aria-label="Close sidebar">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
            </svg>
          </button>
        </div>
        ${state.selectedFile ? '<div class="file-pill">Active file</div>' : ""}
      </div>
      <div id="tree-panel" class="sidebar-section sidebar-section-tree">
        <div class="section-label">Structure</div>
        <div class="sidebar-tree ${compareTreeScrollEnabled ? "is-compare-mode" : ""}">
          <ul id="tree-list" class="tree-root">
            ${renderNode(treeRoot, state, compareContext)}
          </ul>
        </div>
        <div id="tree-status" class="tree-status" aria-live="polite"></div>
      </div>
      <!-- SPA-specific layout: metadata lives below the tree instead of in a main-pane inspect tab. -->
      ${renderSidebarMetadata(state)}
    </aside>
  `;
}

let sidebarTreeEventRoot = null;
let sidebarTreeActions = {};
let disposeSidebarTreeEvents = null;

function clearSidebarTreeBindings() {
  if (typeof disposeSidebarTreeEvents === "function") {
    try {
      disposeSidebarTreeEvents();
    } catch (_error) {
      // ignore cleanup failures on detached roots
    }
  }
  disposeSidebarTreeEvents = null;
  sidebarTreeEventRoot = null;
}

function bindSidebarTreeEvents(root, actions) {
  if (!root) {
    return;
  }

  sidebarTreeActions = actions && typeof actions === "object" ? actions : {};
  if (sidebarTreeEventRoot === root && typeof disposeSidebarTreeEvents === "function") {
    return;
  }

  clearSidebarTreeBindings();
  sidebarTreeEventRoot = root;

  const onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const compareButton = target.closest("[data-tree-compare-add-path]");
    if (compareButton && root.contains(compareButton)) {
      event.preventDefault();
      event.stopPropagation();

      if (compareButton.disabled) {
        return;
      }

      const shape = String(compareButton.dataset.treeCompareAddShape || "")
        .split(",")
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry >= 0);

      if (typeof sidebarTreeActions.addLineCompareDataset === "function") {
        sidebarTreeActions.addLineCompareDataset({
          path: compareButton.dataset.treeCompareAddPath || "/",
          name: compareButton.dataset.treeCompareAddName || "",
          type: compareButton.dataset.treeCompareAddType || "dataset",
          dtype: compareButton.dataset.treeCompareAddDtype || "",
          ndim: Number(compareButton.dataset.treeCompareAddNdim),
          shape,
        });
      }
      return;
    }

    const toggleButton = target.closest("[data-tree-toggle-path]");
    if (toggleButton && root.contains(toggleButton)) {
      event.stopPropagation();
      if (typeof sidebarTreeActions.toggleTreePath === "function") {
        sidebarTreeActions.toggleTreePath(toggleButton.dataset.treeTogglePath || "/");
      }
      return;
    }

    const retryButton = target.closest("[data-tree-retry-path]");
    if (retryButton && root.contains(retryButton)) {
      if (typeof sidebarTreeActions.loadTreeChildren === "function") {
        void sidebarTreeActions.loadTreeChildren(retryButton.dataset.treeRetryPath || "/", {
          force: true,
        });
      }
      return;
    }

    const selectButton = target.closest("[data-tree-select-path]");
    if (selectButton && root.contains(selectButton)) {
      if (typeof sidebarTreeActions.selectTreeNode === "function") {
        sidebarTreeActions.selectTreeNode({
          path: selectButton.dataset.treeSelectPath || "/",
          type: selectButton.dataset.treeSelectType || "group",
          name: selectButton.dataset.treeSelectName || "",
        });
      }
    }
  };

  root.addEventListener("click", onClick);
  disposeSidebarTreeEvents = function disposeSidebarTreeEventsImpl() {
    root.removeEventListener("click", onClick);
  };
}
  if (typeof renderSidebarTree !== "undefined") {
    moduleState.renderSidebarTree = renderSidebarTree;
    global.renderSidebarTree = renderSidebarTree;
  }
  if (typeof bindSidebarTreeEvents !== "undefined") {
    moduleState.bindSidebarTreeEvents = bindSidebarTreeEvents;
    global.bindSidebarTreeEvents = bindSidebarTreeEvents;
  }
  if (typeof clearSidebarTreeBindings !== "undefined") {
    moduleState.clearSidebarTreeBindings = clearSidebarTreeBindings;
    global.clearSidebarTreeBindings = clearSidebarTreeBindings;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("components/sidebarTree");
  }
})(typeof window !== "undefined" ? window : globalThis);
