// Viewer HTML module: Orchestrates static shell rendering, status updates, delegated UI events, and export dispatching.
(function (global) {
  "use strict";

  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for views/viewerView.");
    return;
  }

  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading views/viewerView.");
    return;
  }

  var moduleState = ensurePath(ns, "views.viewerView");
  var domRefs = ns.core && ns.core.domRefs ? ns.core.domRefs : null;

  if (!domRefs || typeof domRefs.collect !== "function" || typeof domRefs.validate !== "function") {
    console.error("[HDFViewer] Missing core/domRefs dependency for views/viewerView.");
    return;
  }

  var REQUIRED_DOM_IDS = Array.isArray(domRefs.REQUIRED_IDS) ? domRefs.REQUIRED_IDS : [];
  // Module-level state for the single delegated event listener on the shell root
  var disposeViewerViewBindings = null;
  var eventRoot = null;
  var eventActions = {};
  // Guards against concurrent export button presses triggering duplicate downloads
  var exportRunning = false;

  // Returns escapeHtml from utils/format.js for XSS-safe rendering; falls back to an inline implementation
  function resolveEscapeHtml() {
    if (typeof escapeHtml === "function") {
      return escapeHtml;
    }
    return function fallbackEscape(value) {
      return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    };
  }

  function collectDomRefs(rootDoc) {
    return domRefs.collect(rootDoc || document);
  }

  function validateViewerDomIds(rootDoc) {
    return domRefs.validate(rootDoc || document);
  }

  // Extracts innerHTML from the first child of an HTML string; used to strip wrappers added by component render functions
  function stripSingleRoot(html) {
    var markup = typeof html === "string" ? html.trim() : "";
    if (!markup) {
      return "";
    }

    var template = document.createElement("template");
    template.innerHTML = markup;
    var firstElement = template.content.firstElementChild;

    if (!firstElement) {
      return markup;
    }

    return firstElement.innerHTML;
  }

  // Removes the current event delegation listener and cleans up sidebar and panel runtime bindings
  function clearViewerViewBindings() {
    if (typeof disposeViewerViewBindings === "function") {
      try {
        disposeViewerViewBindings();
      } catch (_error) {
        // ignore cleanup errors from detached nodes
      }
    }

    disposeViewerViewBindings = null;
    eventRoot = null;
    eventActions = {};
    exportRunning = false;

    if (typeof clearSidebarTreeBindings === "function") {
      clearSidebarTreeBindings();
    }
    if (typeof clearRuntimePanelBindings === "function") {
      clearRuntimePanelBindings();
    }
  }

  // Async init hook called during boot; currently a no-op, reserved for future template pre-hydration logic
  async function initViewerViewTemplate() {
    return Promise.resolve();
  }

  function normalizePath(path) {
    if (!path || path === "/") {
      return "/";
    }

    var normalized = "/" + String(path).replace(/^\/+/, "").replace(/\/+$/g, "");
    return normalized || "/";
  }

  function getBreadcrumbSegments(path) {
    var normalized = normalizePath(path);
    var parts = normalized === "/" ? [] : normalized.split("/").filter(Boolean);
    var current = "";

    return parts.map(function (part) {
      current += "/" + part;
      return {
        label: part,
        path: current,
      };
    });
  }

  function renderViewerTopBar(state) {
    var esc = resolveEscapeHtml();
    var segments = getBreadcrumbSegments(state.selectedPath);
    var fileCrumbActive = segments.length === 0 ? "active" : "";

    return `
      <div class="topbar-left">
        <button id="sidebar-toggle-btn" class="sidebar-toggle-btn" type="button" aria-label="Toggle sidebar">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="5" x2="17" y2="5"/>
            <line x1="3" y1="10" x2="17" y2="10"/>
            <line x1="3" y1="15" x2="17" y2="15"/>
          </svg>
        </button>
        <div class="topbar-path">
          <div class="breadcrumb-label">File location</div>
          <div id="breadcrumb-path" class="breadcrumb">
            <button id="breadcrumb-file" class="crumb crumb-btn ${fileCrumbActive}" data-breadcrumb-path="/" type="button">${esc(
      state.selectedFile || "No file selected"
    )}</button>
            ${segments
              .map(function (segment, index) {
                var active = index === segments.length - 1 ? "active" : "";
                return `<button class="crumb crumb-btn ${active}" data-breadcrumb-path="${esc(
                  segment.path
                )}" type="button">${esc(segment.label)}</button>`;
              })
              .join("")}
          </div>
        </div>
      </div>

      <div class="topbar-right">
        <button id="viewer-back-btn" class="ghost-btn" type="button">
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 2 4 8 10 14"/></svg>
          <span class="btn-label">Back to files</span>
        </button>
        <button id="viewer-fullscreen-btn" class="ghost-btn" type="button" title="Toggle fullscreen">
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg>
          <span class="btn-label">Fullscreen</span>
        </button>
      </div>
    `;
  }

  function renderExportMenu(target, disabled) {
    var esc = resolveEscapeHtml();
    var targetKey = String(target || "").trim().toLowerCase();
    var options =
      targetKey === "line" || targetKey === "heatmap"
        ? [
            { action: "csv-displayed", label: "CSV (Displayed)" },
            { action: "csv-full", label: "CSV (Full)" },
            { action: "png-current", label: "PNG (Current View)" },
          ]
        : [
            { action: "csv-displayed", label: "CSV (Displayed)" },
            { action: "csv-full", label: "CSV (Full)" },
          ];

    return `
      <div class="subbar-export-wrap" data-export-root="true">
        <button
          type="button"
          class="subbar-export"
          data-export-toggle="true"
          aria-haspopup="menu"
          aria-expanded="false"
          ${disabled ? "disabled" : ""}
        >
          Export
        </button>
        <div class="subbar-export-menu" data-export-menu="true" role="menu" aria-hidden="true">
          ${options
            .map(function (option) {
              return `
                <button
                  type="button"
                  class="subbar-export-item"
                  data-export-target="${esc(targetKey || "matrix")}" 
                  data-export-action="${esc(option.action)}"
                  role="menuitem"
                  ${disabled ? "disabled" : ""}
                >
                  ${esc(option.label)}
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function renderPreviewToolbar(state) {
    var activeTab = state.displayTab || "line";
    var disabled = state.selectedNodeType !== "dataset" || state.previewLoading;
    var showHeatmap = Number((state.preview && state.preview.ndim) || 0) >= 2;

    return `
      <div id="subbar-tabs" class="subbar-tabs">
        <button type="button" class="subbar-tab ${activeTab === "table" ? "active" : ""}" data-display-tab="table" ${
      disabled ? "disabled" : ""
    }>Matrix</button>
        <button type="button" class="subbar-tab ${activeTab === "line" ? "active" : ""}" data-display-tab="line" ${
      disabled ? "disabled" : ""
    }>Line Graph</button>
        ${
          showHeatmap
            ? `<button type="button" class="subbar-tab ${
                activeTab === "heatmap" ? "active" : ""
              }" data-display-tab="heatmap" ${disabled ? "disabled" : ""}>Heatmap</button>`
            : ""
        }
      </div>

      ${
        activeTab === "line"
          ? `<div id="subbar-actions" class="subbar-actions">
               <button type="button" class="subbar-toggle ${
                 state.lineGrid ? "active" : ""
               }" data-line-grid-toggle="true" ${disabled ? "disabled" : ""}>Grid</button>
               <div class="aspect-group">
                 <span class="aspect-label">Aspect</span>
                 <div class="aspect-tabs">
                   ${["line", "point", "both"]
                     .map(function (value) {
                       return `<button type="button" class="aspect-tab ${
                         state.lineAspect === value ? "active" : ""
                       }" data-line-aspect="${value}" ${disabled ? "disabled" : ""}>${
                         value.charAt(0).toUpperCase() + value.slice(1)
                       }</button>`;
                     })
                     .join("")}
                 </div>
               </div>
               ${renderExportMenu("line", disabled)}
             </div>`
          : activeTab === "heatmap"
          ? `<div id="subbar-actions" class="subbar-actions">
               <button type="button" class="subbar-toggle ${
                 state.heatmapGrid ? "active" : ""
               }" data-heatmap-grid-toggle="true" ${disabled ? "disabled" : ""}>Grid</button>
               <div class="colormap-group">
                 <span class="colormap-label">Color</span>
                 <div class="colormap-tabs">
                   ${["viridis", "plasma", "inferno", "magma", "cool", "hot"]
                     .map(function (value) {
                       return `<button type="button" class="colormap-tab ${
                         state.heatmapColormap === value ? "active" : ""
                       }" data-heatmap-colormap="${value}" ${disabled ? "disabled" : ""}>${
                         value.charAt(0).toUpperCase() + value.slice(1)
                       }</button>`;
                     })
                     .join("")}
                 </div>
               </div>
               ${renderExportMenu("heatmap", disabled)}
             </div>`
          : `<div id="subbar-actions" class="subbar-actions">
               <div class="notation-group">
                 <span class="notation-label">Notation</span>
                 <div class="notation-tabs">
                   ${["auto", "scientific", "exact"]
                     .map(function (value) {
                       return `<button type="button" class="notation-tab ${
                         state.notation === value ? "active" : ""
                       }" data-notation="${value}" ${disabled ? "disabled" : ""}>${
                         value.charAt(0).toUpperCase() + value.slice(1)
                       }</button>`;
                     })
                     .join("")}
                 </div>
               </div>
               ${renderExportMenu("matrix", disabled)}
             </div>`
      }
    `;
  }

  function renderMissingFilePanel(exampleUrl) {
    var esc = resolveEscapeHtml();
    var example = exampleUrl || "?file=<url-encoded-object-key>";
    return `
      <div class="panel-state">
        <div class="state-title">Missing <code>file</code> query parameter</div>
        <div class="state-text">Open viewer using <code>${esc(example)}</code>.</div>
      </div>
    `;
  }

  function resolveTreeStatus(state, missingFile) {
    if (missingFile) {
      return { tone: "info", message: "Provide file query parameter to load tree." };
    }
    if (!state.selectedFile) {
      return { tone: "info", message: "No active file selected." };
    }

    var rootLoading =
      state.treeLoadingPaths instanceof Set && state.treeLoadingPaths.has("/");
    if (rootLoading) {
      return { tone: "info", message: "Loading tree..." };
    }

    var rootError =
      state.treeErrors instanceof Map ? state.treeErrors.get("/") : null;
    if (rootError) {
      return { tone: "error", message: String(rootError) };
    }

    return { tone: "info", message: "" };
  }

  function resolveDisplayStatus(state, missingFile) {
    if (missingFile) {
      return {
        tone: "info",
        message: "Viewer is blocked until a file key is provided.",
      };
    }

    if (state.previewError) {
      return { tone: "error", message: String(state.previewError) };
    }
    if (state.previewLoading) {
      return { tone: "info", message: "Loading preview..." };
    }

    return { tone: "info", message: "" };
  }

  function resolveInspectStatus(state, missingFile) {
    if (missingFile) {
      return {
        tone: "info",
        message: "Metadata loading is disabled until file is provided.",
      };
    }

    if (state.metadataError) {
      return { tone: "error", message: String(state.metadataError) };
    }
    if (state.metadataLoading) {
      return { tone: "info", message: "Loading metadata..." };
    }

    return { tone: "info", message: "" };
  }

  function resolveGlobalStatus(state, missingFile) {
    if (missingFile) {
      return {
        tone: "error",
        message: "Viewer is blocked until ?file= is provided.",
      };
    }

    if (state.error) {
      return { tone: "error", message: String(state.error) };
    }
    if (state.refreshing) {
      return { tone: "info", message: "Refreshing files..." };
    }

    return { tone: "info", message: "" };
  }

  function renderViewerView(state, options) {
    var opts = options && typeof options === "object" ? options : {};
    var validation = validateViewerDomIds(document);

    if (!validation.ok) {
      return "";
    }

    var refs = collectDomRefs(document);
    var missingFile = opts.missingFile === true;
    var treeStatus = resolveTreeStatus(state, missingFile);
    var displayStatus = resolveDisplayStatus(state, missingFile);
    var globalStatus = resolveGlobalStatus(state, missingFile);

    domRefs.toggleClass(refs.viewerApp, "sidebar-open", !!state.sidebarOpen);
    domRefs.toggleClass(refs.viewerApp, "sidebar-collapsed", !state.sidebarOpen);

    if (refs.sidebarBackdrop) {
      refs.sidebarBackdrop.style.display = state.sidebarOpen && !missingFile ? "" : "none";
    }

    if (typeof renderSidebarTree === "function") {
      domRefs.setHtml(refs.viewerSidebar, stripSingleRoot(renderSidebarTree(state)));
    }
    domRefs.setHtml(refs.viewerTopbar, renderViewerTopBar(state));

    // The SPA shell keeps the main area display-only, so the subbar follows
    // file availability rather than a display/inspect mode toggle.
    if (!missingFile) {
      domRefs.setHidden(refs.viewerSubbar, false);
      domRefs.setHtml(refs.viewerSubbar, renderPreviewToolbar(state));
    } else {
      domRefs.setHidden(refs.viewerSubbar, true);
      domRefs.setHtml(
        refs.viewerSubbar,
        '<div id="subbar-tabs" class="subbar-tabs"></div><div id="subbar-actions" class="subbar-actions"></div>'
      );
    }

    var panelInner =
      typeof renderViewerPanel === "function"
        ? stripSingleRoot(renderViewerPanel(state))
        : "";

    if (missingFile) {
      var missingPanel = renderMissingFilePanel(opts.deepLinkExample);
      domRefs.setHidden(refs.displayPane, false);
      domRefs.setHidden(refs.inspectPane, true);
      domRefs.setHtml(refs.displayPane, missingPanel);
      domRefs.setHtml(refs.inspectPane, "");
    } else {
      // Metadata is rendered inside the sidebar; the main pane always hosts display content.
      domRefs.setHidden(refs.displayPane, false);
      domRefs.setHidden(refs.inspectPane, true);
      domRefs.setHtml(refs.displayPane, panelInner);
      domRefs.setHtml(refs.inspectPane, "");
    }

    domRefs.setStatus(refs.treeStatus, treeStatus.message, treeStatus.tone);
    domRefs.setStatus(refs.displayStatus, displayStatus.message, displayStatus.tone);
    // Legacy inspect status element remains hidden so older DOM expectations still validate.
    domRefs.setStatus(refs.inspectStatus, "", "info");
    domRefs.setHidden(refs.inspectStatus, true);
    domRefs.setStatus(refs.globalStatus, globalStatus.message, globalStatus.tone);

    return "";
  }

  function closeAllExportMenus(root) {
    root.querySelectorAll("[data-export-root]").forEach(function (menuRoot) {
      var menu = menuRoot.querySelector("[data-export-menu]");
      var toggle = menuRoot.querySelector("[data-export-toggle]");
      if (menu) {
        menu.setAttribute("aria-hidden", "true");
      }
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
      }
      menuRoot.classList.remove("is-open");
    });
  }

  function setExportRunning(root, running) {
    exportRunning = running === true;
    root.querySelectorAll("[data-export-action]").forEach(function (button) {
      var baseDisabled = button.dataset.exportBaseDisabled === "1";
      button.disabled = exportRunning || baseDisabled;
    });
  }

  function refreshExportButtonState(root) {
    root.querySelectorAll("[data-export-action]").forEach(function (button) {
      if (!button.dataset.exportBaseDisabled) {
        button.dataset.exportBaseDisabled = button.disabled ? "1" : "0";
      }
      var baseDisabled = button.dataset.exportBaseDisabled === "1";
      button.disabled = exportRunning || baseDisabled;
    });
  }

  function resolveExportShell(root, target) {
    var targetKey = String(target || "").toLowerCase();
    if (targetKey === "matrix") {
      return root.querySelector("[data-matrix-shell]");
    }
    if (targetKey === "line") {
      return root.querySelector("[data-line-shell]");
    }
    if (targetKey === "heatmap") {
      return root.querySelector("[data-heatmap-shell]");
    }
    return null;
  }

  function resolveStatusElement(root, target) {
    var targetKey = String(target || "").toLowerCase();
    if (targetKey === "matrix") {
      return root.querySelector("[data-matrix-status]");
    }
    if (targetKey === "line") {
      return root.querySelector("[data-line-status]");
    }
    if (targetKey === "heatmap") {
      return root.querySelector("[data-heatmap-status]");
    }
    return null;
  }

  function setExportStatus(root, target, message, tone) {
    var statusElement = resolveStatusElement(root, target);
    if (!statusElement) {
      return;
    }

    statusElement.textContent = message;
    statusElement.classList.remove("error", "info");
    if (tone === "error") {
      statusElement.classList.add("error");
    } else {
      statusElement.classList.add("info");
    }
  }

  function resolveExportHandler(exportApi, action) {
    if (!exportApi || typeof exportApi !== "object") {
      return null;
    }

    var normalizedAction = String(action || "");
    if (normalizedAction === "csv-displayed") {
      return exportApi.exportCsvDisplayed;
    }
    if (normalizedAction === "csv-full") {
      return exportApi.exportCsvFull;
    }
    if (normalizedAction === "png-current") {
      return exportApi.exportPng;
    }
    return null;
  }

  async function runExportAction(root, target, action) {
    var shell = resolveExportShell(root, target);
    var targetLabel =
      target === "matrix" ? "matrix view" : target === "line" ? "line chart" : "heatmap";

    if (!shell || !shell.__exportApi) {
      setExportStatus(root, target, "Load full " + targetLabel + " before exporting.", "error");
      return;
    }

    var handler = resolveExportHandler(shell.__exportApi, action);
    if (typeof handler !== "function") {
      setExportStatus(root, target, "Export option not available for " + targetLabel + ".", "error");
      return;
    }

    setExportStatus(root, target, "Preparing export...", "info");
    setExportRunning(root, true);
    try {
      await handler();
    } catch (error) {
      setExportStatus(root, target, (error && error.message) || "Export failed.", "error");
    } finally {
      setExportRunning(root, false);
    }
  }

  function getFullscreenTarget(root) {
    return document.getElementById("viewer-app") || root || document.documentElement;
  }

  function updateFullscreenButton(root) {
    var btn = root.querySelector("#viewer-fullscreen-btn");
    if (!btn) {
      return;
    }

    var fullscreenTarget = getFullscreenTarget(root);
    var isFs = document.fullscreenElement === fullscreenTarget;
    var label = btn.querySelector(".btn-label");
    if (label) {
      label.textContent = isFs ? "Exit Fullscreen" : "Fullscreen";
    }
    btn.title = isFs ? "Exit fullscreen" : "Toggle fullscreen";

    var path = btn.querySelector("svg path");
    if (path) {
      path.setAttribute(
        "d",
        isFs
          ? "M5 2v3H2M11 2v3h3M5 14v-3H2M11 14v-3h3"
          : "M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"
      );
    }
  }

  function bindViewerViewEvents(root, actions) {
    var safeRoot = root || document.getElementById("viewer-app") || document;
    if (!safeRoot) {
      return;
    }

    eventActions = actions && typeof actions === "object" ? actions : {};

    if (eventRoot !== safeRoot || typeof disposeViewerViewBindings !== "function") {
      clearViewerViewBindings();
      eventRoot = safeRoot;

      var onRootClick = function (event) {
        var target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        var exportToggle = target.closest("[data-export-toggle]");
        if (exportToggle && safeRoot.contains(exportToggle)) {
          event.preventDefault();
          event.stopPropagation();
          var menuRoot = exportToggle.closest("[data-export-root]");
          var menu = menuRoot && menuRoot.querySelector("[data-export-menu]");
          if (!menuRoot || !menu) {
            return;
          }
          var nextOpen = !menuRoot.classList.contains("is-open");
          closeAllExportMenus(safeRoot);
          menu.setAttribute("aria-hidden", nextOpen ? "false" : "true");
          exportToggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
          menuRoot.classList.toggle("is-open", nextOpen);
          return;
        }

        var exportAction = target.closest("[data-export-action]");
        if (exportAction && safeRoot.contains(exportAction)) {
          event.preventDefault();
          event.stopPropagation();
          if (exportRunning) {
            return;
          }

          closeAllExportMenus(safeRoot);
          var exportTarget = String(exportAction.dataset.exportTarget || "");
          var exportActionName = String(exportAction.dataset.exportAction || "");
          if (!exportTarget || !exportActionName) {
            return;
          }
          void runExportAction(safeRoot, exportTarget, exportActionName);
          return;
        }

        var sidebarToggle = target.closest("#sidebar-toggle-btn");
        if (sidebarToggle && safeRoot.contains(sidebarToggle)) {
          if (typeof eventActions.toggleSidebar === "function") {
            eventActions.toggleSidebar();
          }
          return;
        }

        var sidebarClose = target.closest("#sidebar-close-btn");
        if (sidebarClose && safeRoot.contains(sidebarClose)) {
          if (typeof eventActions.setSidebarOpen === "function") {
            eventActions.setSidebarOpen(false);
          }
          return;
        }

        var backButton = target.closest("#viewer-back-btn");
        if (backButton && safeRoot.contains(backButton)) {
          if (typeof eventActions.goHome === "function") {
            eventActions.goHome();
          }
          return;
        }

        var fullscreenBtn = target.closest("#viewer-fullscreen-btn");
        if (fullscreenBtn && safeRoot.contains(fullscreenBtn)) {
          (async function toggleFullscreen() {
            try {
              var fullscreenTarget = getFullscreenTarget(safeRoot);
              if (document.fullscreenElement === fullscreenTarget) {
                await document.exitFullscreen();
                return;
              }

              if (document.fullscreenElement) {
                await document.exitFullscreen();
              }

              if (fullscreenTarget.requestFullscreen) {
                await fullscreenTarget.requestFullscreen();
              }
            } catch (_error) {
              // ignore fullscreen errors
            }
          })();
          return;
        }

        var viewModeButton = target.closest("[data-view-mode]");
        if (viewModeButton && safeRoot.contains(viewModeButton)) {
          if (typeof eventActions.setViewMode === "function") {
            eventActions.setViewMode(viewModeButton.dataset.viewMode || "inspect");
          }
          return;
        }

        var breadcrumbButton = target.closest("[data-breadcrumb-path]");
        if (breadcrumbButton && safeRoot.contains(breadcrumbButton)) {
          if (typeof eventActions.onBreadcrumbSelect === "function") {
            eventActions.onBreadcrumbSelect(breadcrumbButton.dataset.breadcrumbPath || "/");
          }
          return;
        }

        var displayTabButton = target.closest("[data-display-tab]");
        if (displayTabButton && safeRoot.contains(displayTabButton)) {
          if (typeof eventActions.setDisplayTab === "function") {
            eventActions.setDisplayTab(displayTabButton.dataset.displayTab || "line");
          }
          return;
        }

        var notationButton = target.closest("[data-notation]");
        if (notationButton && safeRoot.contains(notationButton)) {
          if (typeof eventActions.setNotation === "function") {
            eventActions.setNotation(notationButton.dataset.notation || "auto");
          }
          return;
        }

        var lineGridButton = target.closest("[data-line-grid-toggle]");
        if (lineGridButton && safeRoot.contains(lineGridButton)) {
          if (typeof eventActions.toggleLineGrid === "function") {
            eventActions.toggleLineGrid();
          }
          return;
        }

        var lineAspectButton = target.closest("[data-line-aspect]");
        if (lineAspectButton && safeRoot.contains(lineAspectButton)) {
          if (typeof eventActions.setLineAspect === "function") {
            eventActions.setLineAspect(lineAspectButton.dataset.lineAspect || "line");
          }
          return;
        }

        var heatmapGridButton = target.closest("[data-heatmap-grid-toggle]");
        if (heatmapGridButton && safeRoot.contains(heatmapGridButton)) {
          if (typeof eventActions.toggleHeatmapGrid === "function") {
            eventActions.toggleHeatmapGrid();
          }
          return;
        }

        var heatmapColorButton = target.closest("[data-heatmap-colormap]");
        if (heatmapColorButton && safeRoot.contains(heatmapColorButton)) {
          if (typeof eventActions.setHeatmapColormap === "function") {
            eventActions.setHeatmapColormap(heatmapColorButton.dataset.heatmapColormap || "viridis");
          }
        }
      };

      var onDocumentClick = function (event) {
        var target = event.target;
        if (target && target.id === "sidebar-backdrop") {
          if (typeof eventActions.setSidebarOpen === "function") {
            eventActions.setSidebarOpen(false);
          }
        }

        if (!(target instanceof Element) || !target.closest("[data-export-root]")) {
          closeAllExportMenus(safeRoot);
        }
      };

      var onDocumentKeyDown = function (event) {
        if (event.key === "Escape") {
          closeAllExportMenus(safeRoot);
        }
      };

      var onFullscreenChange = function () {
        updateFullscreenButton(safeRoot);
      };

      safeRoot.addEventListener("click", onRootClick);
      document.addEventListener("click", onDocumentClick);
      document.addEventListener("keydown", onDocumentKeyDown);
      document.addEventListener("fullscreenchange", onFullscreenChange);

      disposeViewerViewBindings = function disposeViewerBindingsImpl() {
        safeRoot.removeEventListener("click", onRootClick);
        document.removeEventListener("click", onDocumentClick);
        document.removeEventListener("keydown", onDocumentKeyDown);
        document.removeEventListener("fullscreenchange", onFullscreenChange);
      };
    }

    refreshExportButtonState(safeRoot);
    updateFullscreenButton(safeRoot);

    if (typeof bindSidebarTreeEvents === "function") {
      bindSidebarTreeEvents(safeRoot, eventActions);
    }
    if (typeof bindViewerPanelEvents === "function") {
      bindViewerPanelEvents(safeRoot, eventActions);
    }
  }

  moduleState.REQUIRED_DOM_IDS = REQUIRED_DOM_IDS;
  moduleState.validateViewerDomIds = validateViewerDomIds;
  moduleState.clearViewerViewBindings = clearViewerViewBindings;
  moduleState.initViewerViewTemplate = initViewerViewTemplate;
  moduleState.renderViewerView = renderViewerView;
  moduleState.bindViewerViewEvents = bindViewerViewEvents;

  global.REQUIRED_DOM_IDS = REQUIRED_DOM_IDS;
  global.validateViewerDomIds = validateViewerDomIds;
  global.clearViewerViewBindings = clearViewerViewBindings;
  global.initViewerViewTemplate = initViewerViewTemplate;
  global.renderViewerView = renderViewerView;
  global.bindViewerViewEvents = bindViewerViewEvents;

  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("views/viewerView");
  }
})(typeof window !== "undefined" ? window : globalThis);

