// Viewer HTML module: Centralizes static viewer shell DOM IDs and helper functions for status, visibility, and class toggling.
(function (global) {
  "use strict";

  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for core/domRefs.");
    return;
  }

  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading core/domRefs.");
    return;
  }

  var moduleState = ensurePath(ns, "core.domRefs");

  // Authoritative list of all element IDs that must exist in the HTML shell before the viewer boots
  var REQUIRED_IDS = [
    "viewer-app",
    "viewer-sidebar",
    "sidebar-header",
    "tree-panel",
    "tree-list",
    "tree-status",
    "metadata-panel",
    "viewer-main",
    "viewer-topbar",
    "breadcrumb-file",
    "breadcrumb-path",
    "viewer-subbar",
    "subbar-tabs",
    "subbar-actions",
    "viewer-panel",
    "display-pane",
    "inspect-pane",
    "display-status",
    "inspect-status",
    "global-status",
    "sidebar-backdrop",
    "sidebar-toggle-btn",
    "sidebar-close-btn",
    "viewer-back-btn",
    "viewer-fullscreen-btn",
  ];

  // Collects all required DOM nodes into a single object so callers never scatter getElementById calls throughout UI code
  function collect(doc) {
    var rootDoc = doc || document;
    return {
      viewerApp: rootDoc.getElementById("viewer-app"),
      viewerSidebar: rootDoc.getElementById("viewer-sidebar"),
      sidebarHeader: rootDoc.getElementById("sidebar-header"),
      treePanel: rootDoc.getElementById("tree-panel"),
      treeList: rootDoc.getElementById("tree-list"),
      treeStatus: rootDoc.getElementById("tree-status"),
      metadataPanel: rootDoc.getElementById("metadata-panel"),
      viewerMain: rootDoc.getElementById("viewer-main"),
      viewerTopbar: rootDoc.getElementById("viewer-topbar"),
      breadcrumbFile: rootDoc.getElementById("breadcrumb-file"),
      breadcrumbPath: rootDoc.getElementById("breadcrumb-path"),
      viewerSubbar: rootDoc.getElementById("viewer-subbar"),
      subbarTabs: rootDoc.getElementById("subbar-tabs"),
      subbarActions: rootDoc.getElementById("subbar-actions"),
      viewerPanel: rootDoc.getElementById("viewer-panel"),
      displayPane: rootDoc.getElementById("display-pane"),
      inspectPane: rootDoc.getElementById("inspect-pane"),
      displayStatus: rootDoc.getElementById("display-status"),
      inspectStatus: rootDoc.getElementById("inspect-status"),
      globalStatus: rootDoc.getElementById("global-status"),
      sidebarBackdrop: rootDoc.getElementById("sidebar-backdrop"),
      sidebarToggleBtn: rootDoc.getElementById("sidebar-toggle-btn"),
      sidebarCloseBtn: rootDoc.getElementById("sidebar-close-btn"),
      viewerBackBtn: rootDoc.getElementById("viewer-back-btn"),
      viewerFullscreenBtn: rootDoc.getElementById("viewer-fullscreen-btn"),
    };
  }

  // Scans REQUIRED_IDS and returns { ok, missing[] }; called during boot to catch missing template IDs early
  function validate(doc) {
    var rootDoc = doc || document;
    var missing = [];

    for (var i = 0; i < REQUIRED_IDS.length; i += 1) {
      var id = REQUIRED_IDS[i];
      if (!rootDoc.getElementById(id)) {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      console.error("[HDFViewer] Missing required viewer DOM ids:", missing.join(", "));
      return {
        ok: false,
        missing: missing,
      };
    }

    return {
      ok: true,
      missing: [],
    };
  }

  // Writes a status message onto an element and toggles its CSS tone class ("error" / "info" / neutral)
  function setStatus(element, message, tone) {
    if (!element) {
      return;
    }

    element.textContent = String(message || "");
    // Clear both tone classes first to avoid stale state from a previous call
    element.classList.remove("error", "info");
    if (tone === "error") {
      element.classList.add("error");
    } else if (tone === "info") {
      element.classList.add("info");
    }
  }

  // Sets element.hidden; preferred over toggling CSS display directly so layout calculations remain correct
  function setHidden(element, hidden) {
    if (!element) {
      return;
    }
    element.hidden = !!hidden;
  }

  // Writes raw HTML into an element; callers are responsible for using escapeHtml on any user-visible strings inside html
  function setHtml(element, html) {
    if (!element) {
      return;
    }
    element.innerHTML = String(html || "");
  }

  // Sets element.textContent; safe alternative to setHtml when the content is plain text
  function setText(element, text) {
    if (!element) {
      return;
    }
    element.textContent = String(text || "");
  }

  // Adds or removes a class based on a boolean flag; wraps classList.toggle for IE compatibility
  function toggleClass(element, className, enabled) {
    if (!element || !className) {
      return;
    }
    element.classList.toggle(className, !!enabled);
  }

  moduleState.REQUIRED_IDS = REQUIRED_IDS;
  moduleState.collect = collect;
  moduleState.validate = validate;
  moduleState.setStatus = setStatus;
  moduleState.setHidden = setHidden;
  moduleState.setHtml = setHtml;
  moduleState.setText = setText;
  moduleState.toggleClass = toggleClass;

  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("core/domRefs");
  }
})(typeof window !== "undefined" ? window : globalThis);
