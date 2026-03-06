// Viewer HTML module: Implements interactive line runtime with zoom/pan/click-zoom, compare overlays, and export support.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for components/viewerPanel/runtime/lineRuntime.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading components/viewerPanel/runtime/lineRuntime.");
    return;
  }
  var moduleState = ensurePath(ns, "components.viewerPanel.runtime.lineRuntime");
const LINE_FULLSCREEN_RESTORE_TTL_MS = 1200;
const LINE_COMPARE_COLORS = ["#DC2626", "#16A34A", "#D97706", "#0EA5E9", "#334155"];
let lineFullscreenRestore = null;

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

function parseShapeParam(value) {
  return String(value || "")
    .split(",")
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);
}

function parseCompareItemsPayload(rawValue, currentPath) {
  if (!rawValue) {
    return [];
  }

  try {
    const decoded = decodeURIComponent(String(rawValue));
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set();
    const normalized = [];
    parsed.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }

      const path = String(entry.path || "").trim();
      if (!path || path === currentPath || seen.has(path)) {
        return;
      }

      seen.add(path);
      normalized.push({
        path,
        name: String(entry.name || path),
        dtype: String(entry.dtype || ""),
        ndim: Number(entry.ndim),
        shape: Array.isArray(entry.shape)
          ? entry.shape
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value >= 0)
          : [],
      });
    });

    return normalized;
  } catch (_error) {
    return [];
  }
}

function rememberLineFullscreen(selectionKey) {
  if (!selectionKey) {
    lineFullscreenRestore = null;
    return;
  }
  lineFullscreenRestore = {
    key: selectionKey,
    expiresAt: Date.now() + LINE_FULLSCREEN_RESTORE_TTL_MS,
  };
}

function consumeLineFullscreenRestore(selectionKey) {
  if (!lineFullscreenRestore || !selectionKey) {
    return false;
  }
  const { key, expiresAt } = lineFullscreenRestore;
  lineFullscreenRestore = null;
  return key === selectionKey && Date.now() <= expiresAt;
}
function initializeLineRuntime(shell) {
  if (!shell) {
    return null;
  }
  if (shell.dataset.lineBound === "true") {
    return typeof shell.__lineRuntimeCleanup === "function"
      ? shell.__lineRuntimeCleanup
      : null;
  }

  const canvas = shell.querySelector("[data-line-canvas]");
  const svg = shell.querySelector("[data-line-svg]");
  const rangeLabel = shell.querySelector("[data-line-range-label]");
  const zoomLabel = shell.querySelector("[data-line-zoom-label]");
  const hoverElement = shell.querySelector("[data-line-hover]");
  const minStat = shell.querySelector("[data-line-stat-min]");
  const maxStat = shell.querySelector("[data-line-stat-max]");
  const spanStat = shell.querySelector("[data-line-stat-span]");
  const panToggleButton = shell.querySelector("[data-line-pan-toggle]");
  const zoomClickToggleButton = shell.querySelector("[data-line-zoom-click-toggle]");
  const zoomInButton = shell.querySelector("[data-line-zoom-in]");
  const zoomOutButton = shell.querySelector("[data-line-zoom-out]");
  const resetButton = shell.querySelector("[data-line-reset-view]");
  const jumpStartButton = shell.querySelector("[data-line-jump-start]");
  const stepPrevButton = shell.querySelector("[data-line-step-prev]");
  const stepNextButton = shell.querySelector("[data-line-step-next]");
  const jumpEndButton = shell.querySelector("[data-line-jump-end]");
  const qualitySelect = shell.querySelector("[data-line-quality-select]");
  const windowSelect = shell.querySelector("[data-line-window-select]");
  const jumpInput = shell.querySelector("[data-line-jump-input]");
  const jumpToIndexButton = shell.querySelector("[data-line-jump-to-index]");
  const fullscreenButton = shell.querySelector("[data-line-fullscreen-toggle]");
  const legendElement = shell.querySelector("[data-line-legend]");
  const statusElement =
    shell.closest(".data-section")?.querySelector("[data-line-status]") || null;

  if (!canvas || !svg) {
    return null;
  }

  const fileKey = shell.dataset.lineFileKey || "";
  const fileEtag = shell.dataset.lineFileEtag || "";
  const path = shell.dataset.linePath || "/";
  const displayDims = shell.dataset.lineDisplayDims || "";
  const fixedIndices = shell.dataset.lineFixedIndices || "";
  const notation = shell.dataset.lineNotation || "auto";
  const lineGrid = shell.dataset.lineGrid !== "0";
  const lineAspect = shell.dataset.lineAspect || "line";
  const initialQuality = normalizeLineQuality(shell.dataset.lineQuality);
  const overviewMaxPoints = Math.max(
    1,
    toSafeInteger(shell.dataset.lineOverviewMaxPoints, LINE_DEFAULT_OVERVIEW_MAX_POINTS)
  );
  const exactMaxPoints = Math.max(
    1,
    toSafeInteger(shell.dataset.lineExactMaxPoints, LINE_EXACT_MAX_POINTS)
  );
  const selectionKey =
    shell.dataset.lineSelectionKey ||
    buildLineSelectionKey(fileKey, path, displayDims, fixedIndices, null);
  const totalPoints = Math.max(0, toSafeInteger(shell.dataset.lineTotalPoints, 0));
  const parsedLineIndex = toSafeInteger(shell.dataset.lineIndex, null);
  const lineIndex = Number.isFinite(parsedLineIndex) ? parsedLineIndex : null;
  const parsedLineDim = (shell.dataset.lineDim || "").trim().toLowerCase();
  const lineDim =
    lineIndex === null ? null : parsedLineDim === "col" ? "col" : "row";
  const parsedSelectedPoint = toSafeInteger(shell.dataset.lineSelectedPoint, null);
  const selectedPointX = Number.isFinite(parsedSelectedPoint) ? parsedSelectedPoint : null;
  const compareItems = parseCompareItemsPayload(shell.dataset.lineCompareItems || "", path);
  const baseShape = parseShapeParam(shell.dataset.lineBaseShape || "");
  const baseNdim = Math.max(
    0,
    toSafeInteger(shell.dataset.lineBaseNdim, baseShape.length || 0)
  );
  const baseDtype = String(shell.dataset.lineBaseDtype || "").trim();
  const inlineHeatmapLinked = shell.classList.contains("heatmap-inline-line-shell");

  if (!fileKey || totalPoints <= 0) {
    setMatrixStatus(statusElement, "No line data available.", "error");
    return null;
  }

  shell.dataset.lineBound = "true";

  const runtime = {
    fileKey,
    fileEtag,
    path,
    displayDims,
    fixedIndices,
    notation,
    lineGrid,
    lineAspect,
    selectionKey,
    totalPoints,
    lineIndex,
    lineDim,
    selectedPointX,
    qualityRequested: initialQuality,
    qualityApplied: initialQuality,
    overviewMaxPoints,
    exactMaxPoints,
    requestedPoints: 0,
    returnedPoints: 0,
    lineStep: 1,
    minSpan: Math.max(1, Math.min(LINE_MIN_VIEW_SPAN, totalPoints)),
    viewStart: 0,
    viewSpan: totalPoints,
    fetchTimer: null,
    requestSeq: 0,
    destroyed: false,
    panEnabled: false,
    zoomClickEnabled: false,
    isPanning: false,
    panPointerId: null,
    panStartX: 0,
    panStartViewStart: 0,
    clickZoomPointerId: null,
    clickZoomStartX: 0,
    clickZoomStartY: 0,
    clickZoomMoved: false,
    pendingZoomFocusX: null,
    points: [],
    compareSeries: [],
    renderedSeries: [],
    compareItems,
    failedCompareTargets: [],
    baseShape,
    baseNdim,
    baseDtype,
    frame: null,
    hoverDot: null,
    zoomFocusX: null,
    fullscreenActive: false,
  };

  if (consumeLineFullscreenRestore(selectionKey)) {
    runtime.fullscreenActive = true;
  }

  function getMaxSpanForQuality() {
    if (runtime.qualityRequested === "exact") {
      return Math.max(1, Math.min(runtime.totalPoints, runtime.exactMaxPoints));
    }
    return runtime.totalPoints;
  }

  function clampViewport(start, span) {
    const maxSpan = getMaxSpanForQuality();
    const minSpan = Math.min(runtime.minSpan, maxSpan);
    const safeSpan = clamp(toSafeInteger(span, maxSpan), minSpan, maxSpan);
    const maxStart = Math.max(0, runtime.totalPoints - safeSpan);
    const safeStart = clamp(toSafeInteger(start, 0), 0, maxStart);
    return { start: safeStart, span: safeSpan };
  }

  function persistViewState() {
    LINE_VIEW_CACHE.set(runtime.selectionKey, {
      start: runtime.viewStart,
      span: runtime.viewSpan,
      panEnabled: runtime.panEnabled === true,
      zoomClickEnabled: runtime.zoomClickEnabled === true,
      qualityRequested: runtime.qualityRequested,
      zoomFocusX: Number.isFinite(runtime.zoomFocusX) ? runtime.zoomFocusX : null,
    });
  }

  const cachedView = LINE_VIEW_CACHE.get(runtime.selectionKey);
  if (cachedView && typeof cachedView === "object") {
    runtime.qualityRequested = normalizeLineQuality(
      cachedView.qualityRequested || runtime.qualityRequested
    );
    const restored = clampViewport(cachedView.start, cachedView.span);
    runtime.viewStart = restored.start;
    runtime.viewSpan = restored.span;
    runtime.panEnabled = cachedView.panEnabled === true;
    runtime.zoomClickEnabled = cachedView.zoomClickEnabled === true;
    runtime.zoomFocusX = Number.isFinite(cachedView.zoomFocusX) ? cachedView.zoomFocusX : null;
    if (runtime.panEnabled && runtime.zoomClickEnabled) {
      runtime.zoomClickEnabled = false;
    }
  }

  function getZoomPercent() {
    if (runtime.totalPoints <= 0) {
      return 100;
    }

    const ratio = runtime.totalPoints / Math.max(1, runtime.viewSpan);
    return Math.max(100, Math.round(ratio * 100));
  }

  function updateZoomLabel() {
    if (!zoomLabel) {
      return;
    }

    zoomLabel.textContent = `${getZoomPercent()}%`;
  }

  function updateRangeLabel(pointCount = null) {
    if (!rangeLabel) {
      return;
    }

    const rangeEnd = Math.max(runtime.viewStart, runtime.viewStart + runtime.viewSpan - 1);
    const baseText = `Range: ${runtime.viewStart.toLocaleString()} - ${rangeEnd.toLocaleString()} of ${Math.max(
      0,
      runtime.totalPoints - 1
    ).toLocaleString()}`;
    rangeLabel.textContent =
      typeof pointCount === "number" && pointCount >= 0
        ? `${baseText} | ${pointCount.toLocaleString()} points`
        : baseText;
  }

  function syncQualityControl() {
    if (!qualitySelect) {
      return;
    }
    if (document.activeElement === qualitySelect) {
      return;
    }
    qualitySelect.value = runtime.qualityRequested;
  }

  function syncWindowControl() {
    if (!windowSelect) {
      return;
    }

    const exactMode = runtime.qualityRequested === "exact";
    Array.from(windowSelect.options).forEach((option) => {
      const value = Math.max(1, toSafeInteger(option.value, 1));
      option.disabled = exactMode && value > runtime.exactMaxPoints;
    });

    if (document.activeElement === windowSelect) {
      return;
    }

    const selected = String(runtime.viewSpan);
    const hasExact = Array.from(windowSelect.options).some((option) => option.value === selected);
    if (hasExact) {
      windowSelect.value = selected;
    }
  }

  function syncJumpInput() {
    if (!jumpInput) {
      return;
    }
    jumpInput.min = "0";
    jumpInput.max = String(Math.max(0, runtime.totalPoints - 1));
    if (document.activeElement === jumpInput) {
      return;
    }

    const current = toSafeInteger(jumpInput.value, null);
    if (current === null) {
      return;
    }

    const clamped = clamp(current, 0, Math.max(0, runtime.totalPoints - 1));
    if (clamped !== current) {
      jumpInput.value = String(clamped);
    }
  }

  function hideHover() {
    if (hoverElement) {
      hoverElement.hidden = true;
    }

    if (runtime.hoverDot) {
      runtime.hoverDot.setAttribute("cx", "-9999");
      runtime.hoverDot.setAttribute("cy", "-9999");
      runtime.hoverDot.style.display = "none";
    }
  }

  let inlineScrollSnapshot = null;
  let inlineScrollSnapshotCapturedAt = 0;

  function isInlineControlTarget(event) {
    if (!inlineHeatmapLinked || !event?.target || typeof event.target.closest !== "function") {
      return false;
    }
    const control = event.target.closest(
      "button.line-tool-btn, select.line-tool-select, input.line-tool-input"
    );
    return Boolean(control && shell.contains(control));
  }

  function collectScrollableAncestors(node) {
    if (typeof window === "undefined" || !node) {
      return [];
    }
    const entries = [];
    let current = node.parentElement;
    while (current) {
      const style = window.getComputedStyle(current);
      const overflowY = (style.overflowY || "").toLowerCase();
      const overflowX = (style.overflowX || "").toLowerCase();
      const canScrollY =
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        current.scrollHeight > current.clientHeight + 1;
      const canScrollX =
        (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
        current.scrollWidth > current.clientWidth + 1;
      if (canScrollY || canScrollX) {
        entries.push({
          kind: "element",
          target: current,
          top: current.scrollTop,
          left: current.scrollLeft,
        });
      }
      current = current.parentElement;
    }

    const scrollingElement =
      typeof document !== "undefined" && document.scrollingElement
        ? document.scrollingElement
        : null;
    if (scrollingElement) {
      entries.push({
        kind: "document",
        target: scrollingElement,
        top: scrollingElement.scrollTop,
        left: scrollingElement.scrollLeft,
      });
    }
    return entries;
  }

  function restoreScrollableAncestors(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length < 1) {
      return;
    }
    snapshot.forEach((entry) => {
      if (!entry || !entry.target) {
        return;
      }
      if (entry.kind === "document") {
        entry.target.scrollTop = entry.top;
        entry.target.scrollLeft = entry.left;
        return;
      }
      if (entry.kind === "element" && entry.target.isConnected) {
        entry.target.scrollTop = entry.top;
        entry.target.scrollLeft = entry.left;
      }
    });
  }

  function getActiveInlineScrollSnapshot(maxAgeMs = 2200) {
    if (!Array.isArray(inlineScrollSnapshot) || inlineScrollSnapshot.length < 1) {
      return null;
    }
    const age = Date.now() - inlineScrollSnapshotCapturedAt;
    if (age > maxAgeMs) {
      inlineScrollSnapshot = null;
      inlineScrollSnapshotCapturedAt = 0;
      return null;
    }
    return inlineScrollSnapshot;
  }

  function scheduleInlineScrollRestore(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length < 1) {
      return;
    }
    const runRestore = () => restoreScrollableAncestors(snapshot);
    runRestore();
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(runRestore);
    }
    [0, 60, 140, 260, 420, 700].forEach((delay) => {
      setTimeout(runRestore, delay);
    });
  }

  function snapshotInlineScroll(event) {
    if (!isInlineControlTarget(event)) {
      return;
    }
    inlineScrollSnapshot = collectScrollableAncestors(event.target);
    inlineScrollSnapshotCapturedAt = Date.now();
  }

  function restoreInlineScroll(event) {
    if (!isInlineControlTarget(event)) {
      return;
    }
    const snapshot =
      getActiveInlineScrollSnapshot() || collectScrollableAncestors(event.target);
    scheduleInlineScrollRestore(snapshot);
  }

  function clearTextSelection() {
    if (typeof window === "undefined" || typeof window.getSelection !== "function") {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }
  }

  function syncPanState() {
    canvas.classList.toggle("is-pan", runtime.panEnabled);
    canvas.classList.toggle("is-grabbing", runtime.isPanning);

    if (panToggleButton) {
      panToggleButton.classList.toggle("active", runtime.panEnabled);
    }
  }

  function syncZoomClickState() {
    canvas.classList.toggle("is-zoom-click", runtime.zoomClickEnabled);
    if (zoomClickToggleButton) {
      const label = runtime.zoomClickEnabled ? "Disable zoom on click" : "Zoom on click";
      zoomClickToggleButton.classList.toggle("active", runtime.zoomClickEnabled);
      zoomClickToggleButton.setAttribute("aria-label", label);
      zoomClickToggleButton.setAttribute("title", label);
    }
  }

  function clearClickZoomPointerTracking(event = null) {
    if (
      event &&
      Number.isFinite(runtime.clickZoomPointerId) &&
      runtime.clickZoomPointerId !== event.pointerId
    ) {
      return;
    }
    const activePointerId = runtime.clickZoomPointerId;
    runtime.clickZoomPointerId = null;
    runtime.clickZoomStartX = 0;
    runtime.clickZoomStartY = 0;
    runtime.clickZoomMoved = false;
    if (
      Number.isFinite(activePointerId) &&
      canvas.hasPointerCapture(activePointerId)
    ) {
      canvas.releasePointerCapture(activePointerId);
    }
  }

  function setDocumentFullscreenLock(locked) {
    if (typeof document === "undefined" || !document.body) {
      return;
    }
    document.body.classList.toggle("line-panel-fullscreen-active", locked);
  }

  function rerenderAfterFullscreenChange() {
    if (runtime.destroyed) {
      return;
    }
    if (runtime.points && runtime.points.length >= 2) {
      requestAnimationFrame(() => renderSeries(runtime.points, runtime.compareSeries));
    }
  }

  function syncFullscreenState() {
    const isFullscreen = runtime.fullscreenActive;
    shell.classList.toggle("is-fullscreen", isFullscreen);
    if (fullscreenButton) {
      const label = isFullscreen ? "Exit fullscreen" : "Fullscreen";
      fullscreenButton.setAttribute("aria-label", label);
      fullscreenButton.setAttribute("title", label);
      fullscreenButton.classList.toggle("active", isFullscreen);
    }
    setDocumentFullscreenLock(isFullscreen);
  }

  function updateStats(minValue, maxValue) {
    if (minStat) {
      minStat.textContent = `min: ${formatCell(minValue, runtime.notation)}`;
    }
    if (maxStat) {
      maxStat.textContent = `max: ${formatCell(maxValue, runtime.notation)}`;
    }
    if (spanStat) {
      spanStat.textContent = `span: ${formatCell(maxValue - minValue, runtime.notation)}`;
    }
  }

  function getCompareColor(index) {
    return LINE_COMPARE_COLORS[index % LINE_COMPARE_COLORS.length];
  }

  function shapesMatch(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => Number(entry) === Number(right[index]));
  }

  function updateLegend(seriesList = [], failedTargets = []) {
    if (!legendElement) {
      return;
    }

    const normalizedSeries = Array.isArray(seriesList) ? seriesList : [];
    const normalizedFailures = Array.isArray(failedTargets) ? failedTargets : [];

    if (normalizedSeries.length <= 1 && normalizedFailures.length < 1) {
      legendElement.hidden = true;
      legendElement.innerHTML = "";
      return;
    }

    const seriesMarkup = normalizedSeries
      .map((series) => {
        const path = String(series.path || "");
        const label = String(series.label || path || "Series");
        const color = String(series.color || "#2563EB");
        const suffix = series.isBase ? " (base)" : "";
        return `
          <span class="line-legend-item" title="${escapeHtml(path || label)}">
            <span class="line-legend-swatch" style="background:${escapeHtml(color)}"></span>
            <span class="line-legend-text">${escapeHtml(label + suffix)}</span>
          </span>
        `;
      })
      .join("");

    const failedMarkup = normalizedFailures
      .map((entry) => {
        const label = String(entry?.label || entry?.path || "Series");
        const reason = String(entry?.reason || "Failed to load");
        return `
          <span class="line-legend-item line-legend-item-failed" title="${escapeHtml(reason)}">
            <span class="line-legend-swatch line-legend-swatch-failed"></span>
            <span class="line-legend-text">${escapeHtml(label)} (${escapeHtml(reason)})</span>
          </span>
        `;
      })
      .join("");

    legendElement.hidden = false;
    legendElement.innerHTML = `${seriesMarkup}${failedMarkup}`;
  }

  function getSvgDimensions() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(300, Math.round(rect.width) || LINE_SVG_WIDTH);
    const h = Math.max(200, Math.round(rect.height) || LINE_SVG_HEIGHT);
    return { width: w, height: h };
  }

  function resolveZoomFocusPoint(points) {
    if (!Array.isArray(points) || points.length < 1 || !Number.isFinite(runtime.zoomFocusX)) {
      return null;
    }

    let nearestPoint = points[0];
    let nearestDistance = Math.abs(points[0].x - runtime.zoomFocusX);
    for (let index = 1; index < points.length; index += 1) {
      const candidate = points[index];
      const distance = Math.abs(candidate.x - runtime.zoomFocusX);
      if (distance < nearestDistance) {
        nearestPoint = candidate;
        nearestDistance = distance;
      }
    }

    return nearestPoint;
  }

  function resolveSelectedPoint(points) {
    if (!Array.isArray(points) || points.length < 1 || !Number.isFinite(runtime.selectedPointX)) {
      return null;
    }

    let nearestPoint = points[0];
    let nearestDistance = Math.abs(points[0].x - runtime.selectedPointX);
    for (let index = 1; index < points.length; index += 1) {
      const candidate = points[index];
      const distance = Math.abs(candidate.x - runtime.selectedPointX);
      if (distance < nearestDistance) {
        nearestPoint = candidate;
        nearestDistance = distance;
      }
    }

    return nearestPoint;
  }

  function renderSeries(basePoints, compareSeries = []) {
    const { width, height } = getSvgDimensions();
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const basePadding = { top: 20, right: 18, bottom: 34, left: 48 };
    const baseChartWidth = width - basePadding.left - basePadding.right;
    const baseChartHeight = height - basePadding.top - basePadding.bottom;

    const safeBasePoints = Array.isArray(basePoints) ? basePoints : [];
    const safeCompareSeries = Array.isArray(compareSeries)
      ? compareSeries.filter((entry) => entry && Array.isArray(entry.points) && entry.points.length > 0)
      : [];

    runtime.points = safeBasePoints;
    runtime.compareSeries = safeCompareSeries;
    runtime.renderedSeries = [
      {
        isBase: true,
        path: runtime.path,
        label: "Base",
        color: "#2563EB",
        points: safeBasePoints,
      },
      ...safeCompareSeries,
    ];
    runtime.frame = null;
    runtime.hoverDot = null;

    const domainPoints = runtime.renderedSeries.flatMap((entry) =>
      Array.isArray(entry.points) ? entry.points : []
    );

    if (!Array.isArray(safeBasePoints) || safeBasePoints.length < 2 || domainPoints.length < 2) {
      if (minStat) minStat.textContent = "min: --";
      if (maxStat) maxStat.textContent = "max: --";
      if (spanStat) spanStat.textContent = "span: --";
      svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" class="line-chart-bg"></rect>
        <g class="line-axis">
          <line x1="${basePadding.left}" y1="${basePadding.top + baseChartHeight}" x2="${
        basePadding.left + baseChartWidth
      }" y2="${basePadding.top + baseChartHeight}"></line>
          <line x1="${basePadding.left}" y1="${basePadding.top}" x2="${basePadding.left}" y2="${
        basePadding.top + baseChartHeight
      }"></line>
        </g>
        <text x="${basePadding.left + 8}" y="${
        basePadding.top + 18
      }" class="line-empty-msg">No numeric points in this range.</text>
      `;
      updateLegend(runtime.renderedSeries, runtime.failedCompareTargets);
      hideHover();
      return;
    }

    const xValues = domainPoints.map((point) => point.x);
    const yValues = domainPoints.map((point) => point.y);
    const rawMinX = Math.min(...xValues);
    const rawMaxX = Math.max(...xValues);
    const rawMinY = Math.min(...yValues);
    const rawMaxY = Math.max(...yValues);
    const rawSpanX = rawMaxX - rawMinX;
    const rawSpanY = rawMaxY - rawMinY;
    const domainPadX = rawSpanX === 0 ? 1 : rawSpanX * 0.02;
    const domainPadY = rawSpanY === 0 ? Math.max(Math.abs(rawMinY) * 0.1, 1) : rawSpanY * 0.08;
    const minX = rawMinX - domainPadX;
    const maxX = rawMaxX + domainPadX;
    const minY = rawMinY - domainPadY;
    const maxY = rawMaxY + domainPadY;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    const tickCount = 6;
    const tickValues = Array.from({ length: tickCount }, (_, idx) => {
      const ratio = idx / Math.max(1, tickCount - 1);
      return {
        ratio,
        xValue: minX + ratio * spanX,
        yValue: maxY - ratio * spanY,
      };
    });
    const xTickLabelsText = tickValues.map((tick) => formatCell(tick.xValue, runtime.notation));
    const yTickLabelsText = tickValues.map((tick) => formatCell(tick.yValue, runtime.notation));
    const maxYLabelWidth = yTickLabelsText.reduce(
      (maxWidth, label) => Math.max(maxWidth, measureAxisLabelWidth(label)),
      0
    );
    const firstXHalf = xTickLabelsText.length
      ? measureAxisLabelWidth(xTickLabelsText[0]) / 2
      : 0;
    const lastXHalf = xTickLabelsText.length
      ? measureAxisLabelWidth(xTickLabelsText[xTickLabelsText.length - 1]) / 2
      : 0;
    const padding = {
      top: 20,
      right: clamp(Math.ceil(lastXHalf + 12), 20, Math.floor(width * 0.22)),
      bottom: 34,
      left: clamp(
        Math.ceil(Math.max(maxYLabelWidth + 16, firstXHalf + 10, 62)),
        62,
        Math.floor(width * 0.34)
      ),
    };
    const chartWidth = Math.max(140, width - padding.left - padding.right);
    const chartHeight = Math.max(140, height - padding.top - padding.bottom);
    const yAxisTitleX = Math.max(12, Math.round(padding.left * 0.3));

    runtime.frame = {
      width,
      height,
      padding,
      chartWidth,
      chartHeight,
      minX,
      maxX,
      minY,
      maxY,
      spanX,
      spanY,
    };

    updateStats(rawMinY, rawMaxY);

    const toX = (value) => padding.left + ((value - minX) / spanX) * chartWidth;
    const toY = (value) => padding.top + chartHeight - ((value - minY) / spanY) * chartHeight;

    const ticks = tickValues.map((tick) => {
      const x = padding.left + tick.ratio * chartWidth;
      const y = padding.top + tick.ratio * chartHeight;
      return {
        ratio: tick.ratio,
        x,
        y,
        xValue: tick.xValue,
        yValue: tick.yValue,
      };
    });

    const gridLines = ticks
      .map(
        (tick) => `
          <line x1="${tick.x}" y1="${padding.top}" x2="${tick.x}" y2="${padding.top + chartHeight}"></line>
          <line x1="${padding.left}" y1="${tick.y}" x2="${padding.left + chartWidth}" y2="${tick.y}"></line>
        `
      )
      .join("");

    const xTickLabels = ticks
      .map((tick, idx) => {
        const label = xTickLabelsText[idx] || formatCell(tick.xValue, runtime.notation);
        return `<text x="${tick.x}" y="${padding.top + chartHeight + 18}" text-anchor="middle">${escapeHtml(
          label
        )}</text>`;
      })
      .join("");
    const yTickLabels = ticks
      .map((tick, idx) => {
        const label = yTickLabelsText[idx] || formatCell(tick.yValue, runtime.notation);
        return `<text x="${padding.left - 10}" y="${tick.y + 4}" text-anchor="end">${escapeHtml(
          label
        )}</text>`;
      })
      .join("");

    const showLine = runtime.lineAspect !== "point";
    const showPoints = runtime.lineAspect !== "line";
    const focusPoint = resolveZoomFocusPoint(safeBasePoints);
    const selectedPoint = resolveSelectedPoint(safeBasePoints);

    const seriesMarkup = runtime.renderedSeries
      .map((series, index) => {
        const points = Array.isArray(series.points) ? series.points : [];
        if (points.length < 2) {
          return "";
        }

        const color = String(series.color || (series.isBase ? "#2563EB" : getCompareColor(index)));
        const path = points
          .map(
            (point, pointIndex) =>
              `${pointIndex === 0 ? "M" : "L"}${toX(point.x).toFixed(2)},${toY(point.y).toFixed(2)}`
          )
          .join(" ");
        const sampleEvery = Math.max(1, Math.ceil(points.length / 450));
        const markers = points
          .filter((_, pointIndex) => pointIndex % sampleEvery === 0)
          .map(
            (point) =>
              `<circle cx="${toX(point.x).toFixed(2)}" cy="${toY(point.y).toFixed(
                2
              )}" r="${series.isBase ? 1.9 : 1.5}" style="fill:${escapeHtml(color)}"></circle>`
          )
          .join("");

        return `
          <g class="line-series ${series.isBase ? "line-series-base" : "line-series-compare"}">
            ${
              showLine
                ? `<path class="line-path ${series.isBase ? "line-path-base" : "line-path-compare"}" style="stroke:${escapeHtml(
                    color
                  )}" d="${path}"></path>`
                : ""
            }
            ${showPoints ? `<g class="line-points">${markers}</g>` : ""}
          </g>
        `;
      })
      .join("");

    const focusMarkup = focusPoint
      ? `<g class="line-zoom-focus" data-line-zoom-focus="true">
      <line class="line-zoom-focus-line" x1="${toX(focusPoint.x).toFixed(2)}" y1="${padding.top}" x2="${toX(
          focusPoint.x
        ).toFixed(2)}" y2="${padding.top + chartHeight}"></line>
      <circle class="line-zoom-focus-halo" cx="${toX(focusPoint.x).toFixed(2)}" cy="${toY(
          focusPoint.y
        ).toFixed(2)}" r="9"></circle>
      <circle class="line-zoom-focus-dot" cx="${toX(focusPoint.x).toFixed(2)}" cy="${toY(
          focusPoint.y
        ).toFixed(2)}" r="4.5"></circle>
    </g>`
      : "";
    const selectedMarkup = selectedPoint
      ? `<g class="line-selected-point" data-line-selected-point="true">
      <line class="line-selected-point-line" x1="${toX(selectedPoint.x).toFixed(2)}" y1="${padding.top}" x2="${toX(
          selectedPoint.x
        ).toFixed(2)}" y2="${padding.top + chartHeight}"></line>
      <circle class="line-selected-point-halo" cx="${toX(selectedPoint.x).toFixed(2)}" cy="${toY(
          selectedPoint.y
        ).toFixed(2)}" r="10"></circle>
      <circle class="line-selected-point-dot" cx="${toX(selectedPoint.x).toFixed(2)}" cy="${toY(
          selectedPoint.y
        ).toFixed(2)}" r="5"></circle>
    </g>`
      : "";

    svg.innerHTML = `
      <rect x="0" y="0" width="${width}" height="${height}" class="line-chart-bg"></rect>
      <g class="line-grid">${runtime.lineGrid ? gridLines : ""}</g>
      <g class="line-axis">
        <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${padding.left + chartWidth}" y2="${padding.top + chartHeight}"></line>
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}"></line>
      </g>
      <g class="line-axis-labels">
        ${xTickLabels}
        ${yTickLabels}
      </g>
      <g class="line-axis-titles">
        <text class="line-axis-title line-axis-title-x" x="${padding.left + chartWidth / 2}" y="${height - 6}" text-anchor="middle">Index</text>
        <text class="line-axis-title line-axis-title-y" x="${yAxisTitleX}" y="${
      padding.top + chartHeight / 2
    }" text-anchor="middle" transform="rotate(-90, ${yAxisTitleX}, ${
          padding.top + chartHeight / 2
        })">Value</text>
      </g>
      ${seriesMarkup}
      ${selectedMarkup}
      ${focusMarkup}
      <circle class="line-hover-dot" data-line-hover-dot="true" cx="-9999" cy="-9999" r="4"></circle>
    `;
    runtime.hoverDot = svg.querySelector("[data-line-hover-dot]");
    updateLegend(runtime.renderedSeries, runtime.failedCompareTargets);
    hideHover();
  }

  function scheduleFetch() {
    if (runtime.destroyed) {
      return;
    }

    if (runtime.fetchTimer !== null) {
      clearTimeout(runtime.fetchTimer);
    }

    // Debounce viewport changes so wheel/pan bursts issue one data request.
    runtime.fetchTimer = setTimeout(() => {
      runtime.fetchTimer = null;
      void fetchLineRange();
    }, LINE_FETCH_DEBOUNCE_MS);
  }

  async function fetchLineRange() {
    if (runtime.destroyed) {
      return;
    }

    const requestId = ++runtime.requestSeq;
    const offset = runtime.viewStart;
    const limit = runtime.viewSpan;

    setMatrixStatus(statusElement, "Loading line range...", "info");

    const params = {
      mode: "line",
      quality: runtime.qualityRequested,
      max_points: runtime.overviewMaxPoints,
      line_offset: offset,
      line_limit: limit,
    };

    if (runtime.displayDims) {
      params.display_dims = runtime.displayDims;
    }

    if (runtime.fixedIndices) {
      params.fixed_indices = runtime.fixedIndices;
    }

    if (runtime.lineIndex !== null) {
      if (runtime.lineDim === "row" || runtime.lineDim === "col") {
        params.line_dim = runtime.lineDim;
      }
      params.line_index = runtime.lineIndex;
    }

    if (runtime.fileEtag) {
      params.etag = runtime.fileEtag;
    }

    try {
      const comparePrecheckFailures = [];
      const compareTargets = [];
      const baseNumericKnown = runtime.baseDtype ? isNumericDtype(runtime.baseDtype) : true;
      // Validate compare targets before requesting data so mismatches show explicit reasons.
      runtime.compareItems.forEach((item) => {
        const comparePath = String(item?.path || "").trim();
        if (!comparePath || comparePath === runtime.path) {
          return;
        }

        const compareLabel = String(item?.name || comparePath);
        const compareDtype = String(item?.dtype || "");
        const compareShape = Array.isArray(item?.shape)
          ? item.shape
              .map((entry) => Number(entry))
              .filter((entry) => Number.isFinite(entry) && entry >= 0)
          : [];
        const compareNdim = Number(item?.ndim);

        if (!baseNumericKnown) {
          comparePrecheckFailures.push({
            path: comparePath,
            label: compareLabel,
            reason: "base non-numeric",
          });
          return;
        }

        if (compareDtype && !isNumericDtype(compareDtype)) {
          comparePrecheckFailures.push({
            path: comparePath,
            label: compareLabel,
            reason: "non-numeric",
          });
          return;
        }

        if (
          runtime.baseNdim > 0 &&
          Number.isFinite(compareNdim) &&
          compareNdim !== runtime.baseNdim
        ) {
          comparePrecheckFailures.push({
            path: comparePath,
            label: compareLabel,
            reason: "ndim mismatch",
          });
          return;
        }

        if (
          runtime.baseShape.length > 0 &&
          compareShape.length > 0 &&
          !shapesMatch(runtime.baseShape, compareShape)
        ) {
          comparePrecheckFailures.push({
            path: comparePath,
            label: compareLabel,
            reason: "shape mismatch",
          });
          return;
        }

        compareTargets.push({
          path: comparePath,
          label: compareLabel,
          isBase: false,
          color: getCompareColor(compareTargets.length),
        });
      });

      const requestTargets = [
        {
          path: runtime.path,
          label: "Base",
          isBase: true,
          color: "#2563EB",
        },
        ...compareTargets,
      ];

      // Base and compare ranges are fetched together; compare failures do not block base rendering.
      const settledResponses = await Promise.allSettled(
        requestTargets.map((target) =>
          getFileData(runtime.fileKey, target.path, params, {
            cancelPrevious: true,
          })
        )
      );

      if (runtime.destroyed || requestId !== runtime.requestSeq) {
        return;
      }

      const baseOutcome = settledResponses[0];
      if (!baseOutcome || baseOutcome.status !== "fulfilled") {
        const baseError = baseOutcome?.reason;
        if (baseError?.isAbort || baseError?.code === "ABORTED") {
          return;
        }
        throw baseError || new Error("Failed to load base line dataset.");
      }

      const response = baseOutcome.value;
      runtime.qualityApplied = normalizeLineQuality(response?.quality_applied || runtime.qualityRequested);
      runtime.requestedPoints = Math.max(0, toSafeInteger(response?.requested_points, limit));
      runtime.returnedPoints = Math.max(
        0,
        toSafeInteger(response?.returned_points, Array.isArray(response?.data) ? response.data.length : 0)
      );

      const toPoints = (payload, fallbackOffset = offset) => {
        const step = Math.max(
          1,
          toSafeInteger(payload?.line_step, toSafeInteger(payload?.downsample_info?.step, 1))
        );
        const responseOffset = Math.max(0, toSafeInteger(payload?.line_offset, fallbackOffset));
        const values = Array.isArray(payload?.data) ? payload.data : [];
        const points = values
          .map((value, index) => ({
            x: responseOffset + index * step,
            y: Number(value),
          }))
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

        return { step, points };
      };

      const baseSeries = toPoints(response, offset);
      runtime.lineStep = baseSeries.step;

      const failedTargets = [...comparePrecheckFailures];
      const compareSeries = [];
      settledResponses.slice(1).forEach((outcome, index) => {
        const target = requestTargets[index + 1];
        if (!target) {
          return;
        }

        if (!outcome || outcome.status !== "fulfilled") {
          const reason = outcome?.reason;
          if (reason?.isAbort || reason?.code === "ABORTED") {
            return;
          }
          failedTargets.push({
            path: target.path,
            label: target.label,
            reason: reason?.message || "request failed",
          });
          return;
        }

        const comparePayload = outcome.value;
        const comparePoints = toPoints(comparePayload, offset).points;
        if (comparePoints.length < 2) {
          failedTargets.push({
            path: target.path,
            label: target.label,
            reason: "insufficient points",
          });
          return;
        }

        compareSeries.push({
          isBase: false,
          path: target.path,
          label: target.label,
          color: target.color,
          points: comparePoints,
        });
      });

      runtime.failedCompareTargets = failedTargets;
      runtime.compareSeries = compareSeries;

      if (Number.isFinite(runtime.pendingZoomFocusX)) {
        runtime.zoomFocusX = runtime.pendingZoomFocusX;
      }
      runtime.pendingZoomFocusX = null;

      updateRangeLabel(baseSeries.points.length);
      updateZoomLabel();
      renderSeries(baseSeries.points, compareSeries);
      if (inlineHeatmapLinked) {
        const snapshot = getActiveInlineScrollSnapshot();
        if (snapshot) {
          scheduleInlineScrollRestore(snapshot);
        }
      }

      const compareCount = requestTargets.length - 1;
      const compareLoadedText =
        compareCount > 0
          ? ` | compare ${compareSeries.length}/${compareCount}${failedTargets.length > 0 ? ` (${failedTargets.length} skipped)` : ""}`
          : "";
      setMatrixStatus(
        statusElement,
        `${runtime.qualityApplied === "exact" ? "Exact" : "Overview"} loaded ${baseSeries.points.length.toLocaleString()} points (step ${runtime.lineStep}).${compareLoadedText}`,
        "info"
      );
    } catch (error) {
      if (runtime.destroyed) {
        return;
      }

      if (error?.isAbort || error?.code === "ABORTED") {
        return;
      }

      runtime.failedCompareTargets = [];
      runtime.compareSeries = [];
      updateLegend([], []);
      setMatrixStatus(statusElement, error?.message || "Failed to load line range.", "error");
    }
  }

  function getComparePathsForExport() {
    const seen = new Set();
    const comparePaths = [];
    runtime.compareItems.forEach((item) => {
      const pathValue = String(item?.path || "").trim();
      if (!pathValue || pathValue === runtime.path || seen.has(pathValue)) {
        return;
      }
      seen.add(pathValue);
      comparePaths.push(pathValue);
    });
    return comparePaths;
  }

  async function exportCsvDisplayed() {
    if (runtime.destroyed) {
      throw new Error("Line runtime is no longer active.");
    }

    if (!Array.isArray(runtime.points) || runtime.points.length < 1) {
      await fetchLineRange();
    }

    const basePoints = Array.isArray(runtime.points) ? runtime.points : [];
    if (basePoints.length < 1) {
      throw new Error("No line points available for CSV export.");
    }

    const compareSeries = Array.isArray(runtime.compareSeries) ? runtime.compareSeries : [];
    const compareValueMaps = compareSeries.map((series) => {
      const map = new Map();
      (Array.isArray(series?.points) ? series.points : []).forEach((point) => {
        if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
          map.set(point.x, point.y);
        }
      });
      return map;
    });

    const header = ["index", "base", ...compareSeries.map((series, index) => series?.label || `compare_${index + 1}`)];
    const rows = [toCsvRow(header)];
    basePoints.forEach((point) => {
      const rowValues = [point.x, point.y];
      compareValueMaps.forEach((map) => {
        rowValues.push(map.has(point.x) ? map.get(point.x) : "");
      });
      rows.push(toCsvRow(rowValues));
    });

    const filename = buildExportFilename({
      fileKey: runtime.fileKey,
      path: runtime.path,
      tab: "line",
      scope: "displayed",
      extension: "csv",
    });
    const blob = createCsvBlob(rows, true);
    triggerBlobDownload(blob, filename);
    setMatrixStatus(
      statusElement,
      `Displayed line CSV exported (${basePoints.length.toLocaleString()} rows).`,
      "info"
    );
  }

  async function exportCsvFull() {
    if (runtime.destroyed) {
      throw new Error("Line runtime is no longer active.");
    }

    const query = {
      path: runtime.path,
      mode: "line",
    };
    if (runtime.displayDims) {
      query.display_dims = runtime.displayDims;
    }
    if (runtime.fixedIndices) {
      query.fixed_indices = runtime.fixedIndices;
    }
    if (runtime.fileEtag) {
      query.etag = runtime.fileEtag;
    }
    if (runtime.lineDim === "row" || runtime.lineDim === "col") {
      query.line_dim = runtime.lineDim;
    }
    if (runtime.lineIndex !== null && runtime.lineIndex !== undefined) {
      query.line_index = runtime.lineIndex;
    }

    const comparePaths = getComparePathsForExport();
    if (comparePaths.length > 0) {
      query.compare_paths = comparePaths.join(",");
    }

    const url = buildCsvExportUrl(runtime.fileKey, query);
    triggerUrlDownload(url);
    setMatrixStatus(statusElement, "Full line CSV download started.", "info");
  }

  async function exportPng() {
    if (runtime.destroyed) {
      throw new Error("Line runtime is no longer active.");
    }
    if (!svg) {
      throw new Error("Line chart SVG not available for PNG export.");
    }
    const pngBlob = await svgElementToPngBlob(svg, {
      background: "#FFFFFF",
      scale: 2,
    });
    const filename = buildExportFilename({
      fileKey: runtime.fileKey,
      path: runtime.path,
      tab: "line",
      scope: "current",
      extension: "png",
    });
    triggerBlobDownload(pngBlob, filename);
    setMatrixStatus(statusElement, "Line PNG exported.", "info");
  }

  // Export menu in viewerView reads this runtime-provided API.
  shell.__exportApi = {
    exportCsvDisplayed,
    exportCsvFull,
    exportPng,
  };

  function updateViewport(start, span, immediate = false) {
    const next = clampViewport(start, span);
    const changed = next.start !== runtime.viewStart || next.span !== runtime.viewSpan;
    runtime.viewStart = next.start;
    runtime.viewSpan = next.span;
    updateRangeLabel();
    updateZoomLabel();
    syncWindowControl();
    syncJumpInput();
    persistViewState();

    if (!changed) {
      return false;
    }

    if (immediate) {
      void fetchLineRange();
      return true;
    }

    scheduleFetch();
    return true;
  }

  function zoomBy(factor, anchorRatio = 0.5) {
    const nextSpan = Math.round(runtime.viewSpan * factor);
    if (nextSpan === runtime.viewSpan) {
      return;
    }

    const maxSpan = getMaxSpanForQuality();
    const minSpan = Math.min(runtime.minSpan, maxSpan);
    const clampedSpan = clamp(nextSpan, minSpan, maxSpan);
    const focus = runtime.viewStart + Math.round(anchorRatio * runtime.viewSpan);
    const nextStart = focus - Math.round(anchorRatio * clampedSpan);
    updateViewport(nextStart, clampedSpan, false);
  }

  function onWheel(event) {
    if (runtime.totalPoints <= 1) {
      return;
    }

    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    const factor = event.deltaY < 0 ? 0.88 : 1.12;
    zoomBy(factor, ratio);
  }

  function zoomIntoPointAtClientPosition(clientX, clientY) {
    if (!runtime.frame || runtime.points.length < 2) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const frame = runtime.frame;
    const svgX = ((clientX - rect.left) / Math.max(rect.width, 1)) * frame.width;
    const svgY = ((clientY - rect.top) / Math.max(rect.height, 1)) * frame.height;
    const ratioX = (svgX - frame.padding.left) / frame.chartWidth;
    const ratioY = (svgY - frame.padding.top) / frame.chartHeight;
    if (ratioX < 0 || ratioX > 1 || ratioY < 0 || ratioY > 1) {
      return;
    }

    const pointIndex = clamp(
      Math.round(ratioX * (runtime.points.length - 1)),
      0,
      runtime.points.length - 1
    );
    const point = runtime.points[pointIndex];
    if (!point || !Number.isFinite(point.x)) {
      return;
    }

    runtime.zoomFocusX = point.x;
    runtime.pendingZoomFocusX = point.x;
    const maxSpan = getMaxSpanForQuality();
    const targetSpan = Math.min(runtime.minSpan, maxSpan);
    const nextStart = point.x - Math.floor(targetSpan / 2);
    const changed = updateViewport(nextStart, targetSpan, true);
    if (!changed) {
      renderSeries(runtime.points, runtime.compareSeries);
    }
  }

  function onPointerDown(event) {
    const isMousePointer = !event.pointerType || event.pointerType === "mouse";
    if (isMousePointer && event.button !== 0) {
      return;
    }

    if (
      runtime.panEnabled &&
      runtime.totalPoints > runtime.viewSpan
    ) {
      event.preventDefault();
      clearTextSelection();
      runtime.isPanning = true;
      runtime.panPointerId = event.pointerId;
      runtime.panStartX = event.clientX;
      runtime.panStartViewStart = runtime.viewStart;
      syncPanState();
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (runtime.zoomClickEnabled) {
      event.preventDefault();
      runtime.clickZoomPointerId = event.pointerId;
      runtime.clickZoomStartX = event.clientX;
      runtime.clickZoomStartY = event.clientY;
      runtime.clickZoomMoved = false;
      canvas.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event) {
    if (runtime.panEnabled && runtime.isPanning && runtime.panPointerId === event.pointerId) {
      event.preventDefault();
      clearTextSelection();
      const rect = canvas.getBoundingClientRect();
      const deltaPixels = event.clientX - runtime.panStartX;
      const deltaIndex = Math.round((deltaPixels / Math.max(rect.width, 1)) * runtime.viewSpan);
      const nextStart = runtime.panStartViewStart - deltaIndex;
      updateViewport(nextStart, runtime.viewSpan, false);
      return;
    }

    if (
      runtime.zoomClickEnabled &&
      Number.isFinite(runtime.clickZoomPointerId) &&
      runtime.clickZoomPointerId === event.pointerId &&
      !runtime.clickZoomMoved
    ) {
      const deltaX = event.clientX - runtime.clickZoomStartX;
      const deltaY = event.clientY - runtime.clickZoomStartY;
      runtime.clickZoomMoved = deltaX * deltaX + deltaY * deltaY > 25;
    }

    if (!runtime.frame || runtime.points.length < 2) {
      hideHover();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const frame = runtime.frame;
    const svgX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * frame.width;
    const svgY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * frame.height;
    const ratioX = (svgX - frame.padding.left) / frame.chartWidth;
    const ratioY = (svgY - frame.padding.top) / frame.chartHeight;

    if (ratioX < 0 || ratioX > 1 || ratioY < 0 || ratioY > 1) {
      hideHover();
      return;
    }

    const pointIndex = clamp(
      Math.round(ratioX * (runtime.points.length - 1)),
      0,
      runtime.points.length - 1
    );
    const point = runtime.points[pointIndex];
    const cx = frame.padding.left + ((point.x - frame.minX) / frame.spanX) * frame.chartWidth;
    const cy = frame.padding.top + frame.chartHeight - ((point.y - frame.minY) / frame.spanY) * frame.chartHeight;

    if (runtime.hoverDot) {
      runtime.hoverDot.setAttribute("cx", cx.toFixed(2));
      runtime.hoverDot.setAttribute("cy", cy.toFixed(2));
      runtime.hoverDot.style.display = "";
    }

    if (hoverElement) {
      hoverElement.hidden = false;
      hoverElement.innerHTML = `
        <div>Index: ${escapeHtml(formatCell(point.x, "exact"))}</div>
        <div>Value: ${escapeHtml(formatCell(point.y, runtime.notation))}</div>
      `;
    }
  }

  function onPointerUp(event) {
    if (
      runtime.zoomClickEnabled &&
      Number.isFinite(runtime.clickZoomPointerId) &&
      runtime.clickZoomPointerId === event.pointerId
    ) {
      const shouldZoom = !runtime.clickZoomMoved;
      const clientX = event.clientX;
      const clientY = event.clientY;
      clearClickZoomPointerTracking(event);
      if (shouldZoom) {
        event.preventDefault();
        zoomIntoPointAtClientPosition(clientX, clientY);
      }
      return;
    }
    endPan(event);
  }

  function onPointerCancel(event) {
    clearClickZoomPointerTracking(event);
    endPan(event);
  }

  function endPan(event) {
    if (!runtime.isPanning) {
      return;
    }

    if (event && runtime.panPointerId !== event.pointerId) {
      return;
    }

    runtime.isPanning = false;
    const activePointerId = runtime.panPointerId;
    runtime.panPointerId = null;
    syncPanState();

    if (
      Number.isFinite(activePointerId) &&
      canvas.hasPointerCapture(activePointerId)
    ) {
      canvas.releasePointerCapture(activePointerId);
    }
  }

  function onPointerLeave() {
    clearClickZoomPointerTracking();
    hideHover();
    if (runtime.isPanning) {
      endPan();
    }
    clearClickZoomPointerTracking();
  }

  function onTogglePan() {
    runtime.panEnabled = !runtime.panEnabled;
    if (!runtime.panEnabled && runtime.isPanning) {
      endPan();
    }
    if (runtime.panEnabled) {
      runtime.zoomClickEnabled = false;
      clearClickZoomPointerTracking();
      clearTextSelection();
    }
    syncPanState();
    syncZoomClickState();
    persistViewState();
  }

  function onToggleClickZoom() {
    runtime.zoomClickEnabled = !runtime.zoomClickEnabled;
    if (runtime.zoomClickEnabled) {
      if (runtime.isPanning) {
        endPan();
      }
      runtime.panEnabled = false;
      clearTextSelection();
    }
    clearClickZoomPointerTracking();
    syncPanState();
    syncZoomClickState();
    persistViewState();
  }

  function onZoomIn() {
    zoomBy(1 / 1.15, 0.5);
  }

  function onZoomOut() {
    zoomBy(1.15, 0.5);
  }

  function shiftWindow(direction) {
    if (!Number.isFinite(direction) || direction === 0) {
      return;
    }
    const delta = Math.max(1, Math.round(runtime.viewSpan * direction));
    updateViewport(runtime.viewStart + delta, runtime.viewSpan, true);
  }

  function onJumpStart() {
    updateViewport(0, runtime.viewSpan, true);
  }

  function onJumpEnd() {
    updateViewport(runtime.totalPoints - runtime.viewSpan, runtime.viewSpan, true);
  }

  function onStepPrev() {
    shiftWindow(-1);
  }

  function onStepNext() {
    shiftWindow(1);
  }

  function setQuality(nextQuality) {
    runtime.qualityRequested = normalizeLineQuality(nextQuality);
    runtime.qualityApplied = runtime.qualityRequested;
    syncQualityControl();
    const maxSpan = getMaxSpanForQuality();
    updateViewport(runtime.viewStart, Math.min(runtime.viewSpan, maxSpan), true);
  }

  function onQualityChange() {
    if (!qualitySelect) {
      return;
    }
    setQuality(qualitySelect.value);
  }

  function onWindowChange() {
    if (!windowSelect) {
      return;
    }
    const requested = Math.max(1, toSafeInteger(windowSelect.value, runtime.viewSpan));
    updateViewport(runtime.viewStart, requested, true);
  }

  function onJumpToIndex() {
    if (!jumpInput) {
      return;
    }
    const parsed = toSafeInteger(jumpInput.value, null);
    if (parsed === null) {
      return;
    }

    const target = clamp(parsed, 0, Math.max(0, runtime.totalPoints - 1));
    jumpInput.value = String(target);
    const nextStart = target - Math.floor(runtime.viewSpan / 2);
    updateViewport(nextStart, runtime.viewSpan, true);
  }

  function onJumpInputKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      onJumpToIndex();
    }
  }

  function onKeyDown(event) {
    if (event.defaultPrevented) {
      return;
    }

    const key = event.key;
    if (key === "ArrowLeft") {
      event.preventDefault();
      shiftWindow(-LINE_KEYBOARD_PAN_RATIO);
      return;
    }
    if (key === "ArrowRight") {
      event.preventDefault();
      shiftWindow(LINE_KEYBOARD_PAN_RATIO);
      return;
    }
    if (key === "Home") {
      event.preventDefault();
      onJumpStart();
      return;
    }
    if (key === "End") {
      event.preventDefault();
      onJumpEnd();
      return;
    }
    if (key === "+" || key === "=") {
      event.preventDefault();
      onZoomIn();
      return;
    }
    if (key === "-" || key === "_") {
      event.preventDefault();
      onZoomOut();
    }
  }

  const onReset = () => {
    runtime.zoomClickEnabled = false;
    runtime.zoomFocusX = null;
    runtime.pendingZoomFocusX = null;
    clearClickZoomPointerTracking();
    syncZoomClickState();
    const maxSpan = getMaxSpanForQuality();
    const changed = updateViewport(0, maxSpan, true);
    if (!changed) {
      renderSeries(runtime.points, runtime.compareSeries);
    }
  };

  function onToggleFullscreen() {
    runtime.fullscreenActive = !runtime.fullscreenActive;
    if (!runtime.fullscreenActive) {
      lineFullscreenRestore = null;
    }
    syncFullscreenState();
    rerenderAfterFullscreenChange();
  }

  function onFullscreenEsc(event) {
    if (event.key === "Escape" && runtime.fullscreenActive) {
      event.preventDefault();
      event.stopPropagation();
      runtime.fullscreenActive = false;
      lineFullscreenRestore = null;
      syncFullscreenState();
      rerenderAfterFullscreenChange();
    }
  }

  function exitPanelFullscreen() {
    if (!runtime.fullscreenActive) {
      return;
    }
    runtime.fullscreenActive = false;
    syncFullscreenState();
    rerenderAfterFullscreenChange();
  }

  const onFullscreenButtonClick = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    onToggleFullscreen();
  };

  if (hoverElement) {
    hoverElement.hidden = true;
  }

  syncPanState();
  syncZoomClickState();
  syncFullscreenState();
  syncQualityControl();
  syncWindowControl();
  syncJumpInput();
  updateRangeLabel();
  updateZoomLabel();
  persistViewState();
  setMatrixStatus(statusElement, "Loading initial line range...", "info");
  void fetchLineRange();

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("keydown", onKeyDown);
  if (panToggleButton) {
    panToggleButton.addEventListener("click", onTogglePan);
  }
  if (zoomClickToggleButton) {
    zoomClickToggleButton.addEventListener("click", onToggleClickZoom);
  }
  if (zoomInButton) {
    zoomInButton.addEventListener("click", onZoomIn);
  }
  if (zoomOutButton) {
    zoomOutButton.addEventListener("click", onZoomOut);
  }
  if (resetButton) {
    resetButton.addEventListener("click", onReset);
  }
  if (jumpStartButton) {
    jumpStartButton.addEventListener("click", onJumpStart);
  }
  if (stepPrevButton) {
    stepPrevButton.addEventListener("click", onStepPrev);
  }
  if (stepNextButton) {
    stepNextButton.addEventListener("click", onStepNext);
  }
  if (jumpEndButton) {
    jumpEndButton.addEventListener("click", onJumpEnd);
  }
  if (qualitySelect) {
    qualitySelect.addEventListener("change", onQualityChange);
  }
  if (windowSelect) {
    windowSelect.addEventListener("change", onWindowChange);
  }
  if (jumpToIndexButton) {
    jumpToIndexButton.addEventListener("click", onJumpToIndex);
  }
  if (jumpInput) {
    jumpInput.addEventListener("keydown", onJumpInputKeyDown);
  }
  if (fullscreenButton) {
    fullscreenButton.addEventListener("click", onFullscreenButtonClick);
  }
  if (inlineHeatmapLinked) {
    shell.addEventListener("pointerdown", snapshotInlineScroll, true);
    shell.addEventListener("click", restoreInlineScroll, true);
    shell.addEventListener("change", restoreInlineScroll, true);
  }
  document.addEventListener("keydown", onFullscreenEsc);

  /* ResizeObserver: re-render chart when container resizes */
  let resizeTimer = null;
  const onResize = () => {
    if (runtime.destroyed) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!runtime.destroyed && runtime.points && runtime.points.length >= 2) {
        renderSeries(runtime.points, runtime.compareSeries);
      }
    }, 150);
  };
  let resizeObserver = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener("resize", onResize);
  }

  const cleanup = () => {
    if (runtime.destroyed) {
      LINE_RUNTIME_CLEANUPS.delete(cleanup);
      if (shell.__lineRuntimeCleanup === cleanup) {
        delete shell.__lineRuntimeCleanup;
      }
      if (shell.__exportApi) {
        delete shell.__exportApi;
      }
      delete shell.dataset.lineBound;
      return;
    }
    persistViewState();
    runtime.destroyed = true;
    inlineScrollSnapshot = null;
    inlineScrollSnapshotCapturedAt = 0;
    hideHover();
    if (resizeObserver) {
      resizeObserver.disconnect();
    } else {
      window.removeEventListener("resize", onResize);
    }
    clearTimeout(resizeTimer);
    if (runtime.fetchTimer !== null) {
      clearTimeout(runtime.fetchTimer);
      runtime.fetchTimer = null;
    }
    if (runtime.isPanning) {
      endPan();
    }
    clearClickZoomPointerTracking();
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("keydown", onKeyDown);
    if (panToggleButton) {
      panToggleButton.removeEventListener("click", onTogglePan);
    }
    if (zoomClickToggleButton) {
      zoomClickToggleButton.removeEventListener("click", onToggleClickZoom);
    }
    if (zoomInButton) {
      zoomInButton.removeEventListener("click", onZoomIn);
    }
    if (zoomOutButton) {
      zoomOutButton.removeEventListener("click", onZoomOut);
    }
    if (resetButton) {
      resetButton.removeEventListener("click", onReset);
    }
    if (jumpStartButton) {
      jumpStartButton.removeEventListener("click", onJumpStart);
    }
    if (jumpEndButton) {
      jumpEndButton.removeEventListener("click", onJumpEnd);
    }
    if (stepPrevButton) {
      stepPrevButton.removeEventListener("click", onStepPrev);
    }
    if (stepNextButton) {
      stepNextButton.removeEventListener("click", onStepNext);
    }
    if (qualitySelect) {
      qualitySelect.removeEventListener("change", onQualityChange);
    }
    if (windowSelect) {
      windowSelect.removeEventListener("change", onWindowChange);
    }
    if (jumpToIndexButton) {
      jumpToIndexButton.removeEventListener("click", onJumpToIndex);
    }
    if (jumpInput) {
      jumpInput.removeEventListener("keydown", onJumpInputKeyDown);
    }
    if (fullscreenButton) {
      fullscreenButton.removeEventListener("click", onFullscreenButtonClick);
    }
    if (inlineHeatmapLinked) {
      shell.removeEventListener("pointerdown", snapshotInlineScroll, true);
      shell.removeEventListener("click", restoreInlineScroll, true);
      shell.removeEventListener("change", restoreInlineScroll, true);
    }
    document.removeEventListener("keydown", onFullscreenEsc);
    if (runtime.fullscreenActive) {
      rememberLineFullscreen(runtime.selectionKey);
    }
    const shouldUnlockDocument =
      runtime.fullscreenActive || shell.classList.contains("is-fullscreen");
    exitPanelFullscreen();
    runtime.fullscreenActive = false;
    if (shouldUnlockDocument) {
      setDocumentFullscreenLock(false);
    }
    shell.classList.remove("is-fullscreen");
    LINE_RUNTIME_CLEANUPS.delete(cleanup);
    if (shell.__lineRuntimeCleanup === cleanup) {
      delete shell.__lineRuntimeCleanup;
    }
    if (shell.__exportApi) {
      delete shell.__exportApi;
    }
    delete shell.dataset.lineBound;
  };

  shell.__lineRuntimeCleanup = cleanup;
  LINE_RUNTIME_CLEANUPS.add(cleanup);
  return cleanup;
}
  if (typeof initializeLineRuntime !== "undefined") {
    moduleState.initializeLineRuntime = initializeLineRuntime;
    global.initializeLineRuntime = initializeLineRuntime;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("components/viewerPanel/runtime/lineRuntime");
  }
})(typeof window !== "undefined" ? window : globalThis);
