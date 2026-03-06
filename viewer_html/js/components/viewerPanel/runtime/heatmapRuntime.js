// Viewer HTML module: Implements canvas heatmap runtime with zoom/pan/plot mode, linked line plot, and export support.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for components/viewerPanel/runtime/heatmapRuntime.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading components/viewerPanel/runtime/heatmapRuntime.");
    return;
  }
  var moduleState = ensurePath(ns, "components.viewerPanel.runtime.heatmapRuntime");
const HEATMAP_MAX_SIZE = 1024;
const HEATMAP_MIN_ZOOM = 1;
const HEATMAP_MAX_ZOOM = 8;
const HEATMAP_PAN_START_ZOOM = 1.2;
const HEATMAP_SELECTION_CACHE_LIMIT = 12;
const HEATMAP_SELECTION_DATA_CACHE = new Map();
const HEATMAP_SELECTION_VIEW_CACHE = new Map();
const HEATMAP_FULLSCREEN_RESTORE_TTL_MS = 1200;
let heatmapFullscreenRestore = null;
const HEATMAP_COLOR_STOPS = Object.freeze({
  viridis: [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ],
  plasma: [
    [13, 8, 135],
    [126, 3, 167],
    [203, 71, 119],
    [248, 149, 64],
    [240, 249, 33],
  ],
  inferno: [
    [0, 0, 4],
    [87, 15, 109],
    [187, 55, 84],
    [249, 142, 8],
    [252, 255, 164],
  ],
  magma: [
    [0, 0, 4],
    [73, 15, 109],
    [151, 45, 123],
    [221, 82, 72],
    [252, 253, 191],
  ],
  cool: [
    [0, 255, 255],
    [63, 191, 255],
    [127, 127, 255],
    [191, 63, 255],
    [255, 0, 255],
  ],
  hot: [
    [0, 0, 0],
    [128, 0, 0],
    [255, 64, 0],
    [255, 200, 0],
    [255, 255, 255],
  ],
});

function getColorStops(name) {
  return HEATMAP_COLOR_STOPS[name] || HEATMAP_COLOR_STOPS.viridis;
}

function interpolateColor(stops, ratio) {
  const clamped = clamp(ratio, 0, 1);
  const index = clamped * (stops.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;
  if (lower === upper) {
    return stops[lower];
  }
  const [r1, g1, b1] = stops[lower];
  const [r2, g2, b2] = stops[upper];
  return [
    Math.round(r1 + (r2 - r1) * fraction),
    Math.round(g1 + (g2 - g1) * fraction),
    Math.round(b1 + (b2 - b1) * fraction),
  ];
}

function buildTicks(size, count = 6) {
  const total = Math.max(0, Number(size) || 0);
  if (total <= 0) {
    return [];
  }
  if (total === 1) {
    return [0];
  }
  const target = Math.max(2, Math.min(count, total));
  const ticks = new Set([0, total - 1]);
  for (let index = 1; index < target - 1; index += 1) {
    ticks.add(Math.round((index / (target - 1)) * (total - 1)));
  }
  return Array.from(ticks).sort((a, b) => a - b);
}

/**
 * Build tick marks for the currently visible viewport portion of an axis.
 * @param {number} totalSize  Total number of cells on this axis (rows or cols)
 * @param {number} panOffset  runtime.panX or runtime.panY (negative when panned)
 * @param {number} zoom       runtime.zoom
 * @param {number} chartSpan  layout.chartWidth or layout.chartHeight
 * @param {number} count      desired number of ticks
 * @returns {{dataIndex: number, screenRatio: number}[]}  dataIndex = cell index, screenRatio = 0..1 position on chart axis
 */
function buildViewportTicks(totalSize, panOffset, zoom, chartSpan, count = 6) {
  if (totalSize <= 0 || chartSpan <= 0) return [];
  // visible data range in cell coordinates
  const startCell = (-panOffset / (chartSpan * zoom)) * totalSize;
  const visibleCells = totalSize / zoom;
  const endCell = startCell + visibleCells;
  // clamp to data bounds
  const s = Math.max(0, startCell);
  const e = Math.min(totalSize - 1, endCell);
  if (s >= e) return [{ dataIndex: Math.round(s), screenRatio: 0.5 }];
  // nice tick spacing
  const span = e - s;
  const raw = span / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 5, 10];
  let step = mag;
  for (const c of candidates) {
    if (c * mag >= raw) { step = c * mag; break; }
  }
  step = Math.max(1, Math.round(step));
  const first = Math.ceil(s / step) * step;
  const ticks = [];
  for (let v = first; v <= e; v += step) {
    // screen position ratio (0..1) within the chart area
    const ratio = totalSize <= 1 ? 0.5 : v / (totalSize - 1);
    // screen position accounting for zoom + pan
    const screenPos = ratio * chartSpan * zoom + panOffset;
    const screenRatio = screenPos / chartSpan;
    if (screenRatio >= -0.01 && screenRatio <= 1.01) {
      ticks.push({ dataIndex: Math.round(v), screenRatio: clamp(screenRatio, 0, 1) });
    }
  }
  return ticks;
}

function formatScaleValue(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (Math.abs(value) >= 1e6 || (Math.abs(value) < 1e-3 && value !== 0)) {
    return value.toExponential(2);
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(value) >= 10 ? 1 : 3,
  });
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toDisplayRow(totalRows, rowIndex) {
  const rows = Math.max(0, Number(totalRows) || 0);
  const row = Math.max(0, Number(rowIndex) || 0);
  if (rows <= 0) {
    return 0;
  }
  return Math.max(0, rows - 1 - row);
}

function normalizeHeatmapGrid(data) {
  if (!Array.isArray(data) || !data.length || !Array.isArray(data[0])) {
    return null;
  }

  const rows = data.length;
  const cols = data[0].length;
  if (!cols) {
    return null;
  }

  const values = new Float64Array(rows * cols);
  let hasFiniteValue = false;
  let min = Infinity;
  let max = -Infinity;
  let cursor = 0;

  for (let row = 0; row < rows; row += 1) {
    const sourceRow = Array.isArray(data[row]) ? data[row] : [];
    for (let col = 0; col < cols; col += 1) {
      const numeric = Number(sourceRow[col]);
      if (Number.isFinite(numeric)) {
        values[cursor] = numeric;
        hasFiniteValue = true;
        min = Math.min(min, numeric);
        max = Math.max(max, numeric);
      } else {
        values[cursor] = Number.NaN;
      }
      cursor += 1;
    }
  }

  if (!hasFiniteValue) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    max = min + 1;
  }

  return {
    rows,
    cols,
    values,
    min,
    max,
  };
}

const LUT_SIZE = 256;
const _lutCache = new Map();

function buildColorLUT(colormap) {
  const key = colormap;
  if (_lutCache.has(key)) return _lutCache.get(key);

  const stops = getColorStops(colormap);
  // Flat Uint8Array: [R0,G0,B0, R1,G1,B1, ...] for 256 entries
  const lut = new Uint8Array(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i += 1) {
    const ratio = i / (LUT_SIZE - 1);
    const index = ratio * (stops.length - 1);
    const lower = Math.floor(index);
    const upper = Math.min(lower + 1, stops.length - 1);
    const frac = index - lower;
    const [r1, g1, b1] = stops[lower];
    const [r2, g2, b2] = stops[upper];
    const off = i * 3;
    lut[off] = (r1 + (r2 - r1) * frac + 0.5) | 0;
    lut[off + 1] = (g1 + (g2 - g1) * frac + 0.5) | 0;
    lut[off + 2] = (b1 + (b2 - b1) * frac + 0.5) | 0;
  }
  _lutCache.set(key, lut);
  return lut;
}

function createHeatmapBitmap(grid, min, max, colormap) {
  const surface = document.createElement("canvas");
  surface.width = grid.cols;
  surface.height = grid.rows;
  const context = surface.getContext("2d");
  if (!context) {
    return null;
  }

  const imageData = context.createImageData(grid.cols, grid.rows);
  const pixels = imageData.data;
  const lut = buildColorLUT(colormap);
  const range = max - min || 1;
  const scale = (LUT_SIZE - 1) / range;
  const values = grid.values;
  const len = values.length;

  for (let i = 0; i < len; i += 1) {
    const v = values[i];
    // LUT index: clamp 0..255
    const lutIdx = Number.isFinite(v)
      ? Math.max(0, Math.min(LUT_SIZE - 1, ((v - min) * scale + 0.5) | 0))
      : 0;
    const lutOff = lutIdx * 3;
    const pOff = i << 2;           // i * 4
    pixels[pOff] = lut[lutOff];
    pixels[pOff + 1] = lut[lutOff + 1];
    pixels[pOff + 2] = lut[lutOff + 2];
    pixels[pOff + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return surface;
}

function rememberHeatmapFullscreen(selectionKey) {
  if (!selectionKey) {
    heatmapFullscreenRestore = null;
    return;
  }
  heatmapFullscreenRestore = {
    key: selectionKey,
    expiresAt: Date.now() + HEATMAP_FULLSCREEN_RESTORE_TTL_MS,
  };
}

function consumeHeatmapFullscreenRestore(selectionKey) {
  if (!heatmapFullscreenRestore || !selectionKey) {
    return false;
  }
  const { key, expiresAt } = heatmapFullscreenRestore;
  heatmapFullscreenRestore = null;
  return key === selectionKey && Date.now() <= expiresAt;
}

function getLayout(width, height) {
  const paddingLeft = 46;
  const paddingTop = 24;
  const paddingBottom = 34;
  const colorBarWidth = 18;
  const colorBarGap = 16;
  const colorBarLabelWidth = 56;
  const chartWidth = Math.max(
    120,
    width - paddingLeft - colorBarWidth - colorBarGap - colorBarLabelWidth - 12
  );
  const chartHeight = Math.max(120, height - paddingTop - paddingBottom);
  const chartX = paddingLeft;
  const chartY = paddingTop;
  const colorBarX = chartX + chartWidth + colorBarGap;
  const colorBarY = chartY;

  return {
    chartX,
    chartY,
    chartWidth,
    chartHeight,
    colorBarX,
    colorBarY,
    colorBarWidth,
  };
}

function buildLineWindowOptions(totalPoints) {
  const safeTotal = Math.max(1, Number(totalPoints) || 1);
  const options = LINE_WINDOW_OPTIONS.filter((size) => size <= safeTotal);
  if (!options.includes(safeTotal)) {
    options.push(safeTotal);
  }
  return options.sort((left, right) => left - right);
}

function renderLineToolIcon(kind) {
  if (kind === "pan") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 1v14M1 8h14M8 1 6.3 2.7M8 1l1.7 1.7M8 15l-1.7-1.7M8 15l1.7-1.7M1 8l1.7-1.7M1 8l1.7 1.7M15 8l-1.7-1.7M15 8l-1.7 1.7"></path>
      </svg>
    `;
  }
  if (kind === "zoom-click") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="4.5"></circle>
        <path d="M10.4 10.4 14 14M7 5v4M5 7h4"></path>
        <path d="M2.2 2.2 4.2 4.2"></path>
      </svg>
    `;
  }
  if (kind === "zoom-in") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="4.5"></circle>
        <path d="M10.4 10.4 14 14M7 5v4M5 7h4"></path>
      </svg>
    `;
  }
  if (kind === "zoom-out") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="4.5"></circle>
        <path d="M10.4 10.4 14 14M5 7h4"></path>
      </svg>
    `;
  }
  if (kind === "reset") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M3.2 5.4A5 5 0 1 1 3 8M3 3v3h3"></path>
      </svg>
    `;
  }
  if (kind === "fullscreen") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"></path>
      </svg>
    `;
  }
  return "";
}

function renderLineIconToolButton(label, dataAttr, kind) {
  return `
    <button
      type="button"
      class="line-tool-btn line-tool-btn-icon"
      ${dataAttr}="true"
      aria-label="${label}"
      title="${label}"
    >
      ${renderLineToolIcon(kind)}
    </button>
  `;
}

function renderLinkedLineShellMarkup(config) {
  const windowOptions = buildLineWindowOptions(config.totalPoints);
  const maxIndex = Math.max(0, config.totalPoints - 1);

  return `
    <div
      class="line-chart-shell line-chart-shell-full heatmap-inline-line-shell"
      data-line-shell="true"
      data-line-file-key="${escapeHtml(config.fileKey || "")}"
      data-line-file-etag="${escapeHtml(config.fileEtag || "")}"
      data-line-path="${escapeHtml(config.path || "/")}"
      data-line-display-dims="${escapeHtml(config.displayDims || "")}"
      data-line-fixed-indices="${escapeHtml(config.fixedIndices || "")}"
      data-line-selection-key="${escapeHtml(config.selectionKey || "")}"
      data-line-total-points="${config.totalPoints}"
      data-line-index="${config.lineIndex}"
      data-line-dim="${escapeHtml(config.lineDim || "row")}"
      data-line-selected-point="${Number.isFinite(config.selectedPointIndex) ? config.selectedPointIndex : ""}"
      data-line-notation="${escapeHtml(config.notation || "auto")}"
      data-line-grid="${config.lineGrid ? "1" : "0"}"
      data-line-aspect="${escapeHtml(config.lineAspect || "line")}"
      data-line-quality="${LINE_DEFAULT_QUALITY}"
      data-line-overview-max-points="${LINE_DEFAULT_OVERVIEW_MAX_POINTS}"
      data-line-exact-max-points="${LINE_EXACT_MAX_POINTS}"
    >
      <div class="line-chart-toolbar">
        <div class="line-tool-group">
          ${renderLineIconToolButton("Hand", "data-line-pan-toggle", "pan")}
          ${renderLineIconToolButton("Zoom on click", "data-line-zoom-click-toggle", "zoom-click")}
          ${renderLineIconToolButton("Zoom in", "data-line-zoom-in", "zoom-in")}
          ${renderLineIconToolButton("Zoom out", "data-line-zoom-out", "zoom-out")}
          ${renderLineIconToolButton("Reset view", "data-line-reset-view", "reset")}
        </div>
        <div class="line-tool-group">
          <button type="button" class="line-tool-btn" data-line-jump-start="true">Start</button>
          <button type="button" class="line-tool-btn" data-line-step-prev="true">Prev</button>
          <button type="button" class="line-tool-btn" data-line-step-next="true">Next</button>
          <button type="button" class="line-tool-btn" data-line-jump-end="true">End</button>
        </div>
        <div class="line-tool-group line-tool-group-controls line-tool-group-fullscreen-only">
          <span class="line-tool-label">Quality</span>
          <select class="line-tool-select" data-line-quality-select="true">
            <option value="auto">Auto</option>
            <option value="overview">Overview</option>
            <option value="exact">Exact Window</option>
          </select>
          <span class="line-tool-label">Window</span>
          <select class="line-tool-select" data-line-window-select="true">
            ${windowOptions
              .map((size) => `<option value="${size}">${size.toLocaleString()}</option>`)
              .join("")}
          </select>
          <span class="line-tool-label">Index</span>
          <input
            type="number"
            class="line-tool-input"
            data-line-jump-input="true"
            min="0"
            max="${maxIndex}"
            step="1"
            value="0"
          />
          <button type="button" class="line-tool-btn" data-line-jump-to-index="true">Go</button>
        </div>
        <div class="line-tool-group">
          <span class="line-zoom-label" data-line-zoom-label="true">100%</span>
          ${renderLineIconToolButton("Fullscreen", "data-line-fullscreen-toggle", "fullscreen")}
          <span class="line-zoom-label" data-line-range-label="true">Range: --</span>
        </div>
      </div>
      <div class="line-chart-stage">
        <div class="line-chart-canvas" data-line-canvas="true" tabindex="0" role="application" aria-label="Line chart">
          <svg
            viewBox="0 0 1024 420"
            width="100%"
            height="100%"
            role="img"
            aria-label="Full line view"
            data-line-svg="true"
          ></svg>
          <div class="line-hover" data-line-hover="true" hidden></div>
        </div>
      </div>
      <div class="line-stats">
        <span data-line-stat-min="true">min: --</span>
        <span data-line-stat-max="true">max: --</span>
        <span data-line-stat-span="true">span: --</span>
      </div>
    </div>
  `;
}

function initializeHeatmapRuntime(shell) {
  if (!shell || shell.dataset.heatmapBound === "true") {
    return;
  }

  const canvasHost = shell.querySelector("[data-heatmap-canvas]");
  const canvas = shell.querySelector("[data-heatmap-surface]");
  const tooltip = shell.querySelector("[data-heatmap-hover]");
  const panToggleButton = shell.querySelector("[data-heatmap-pan-toggle]");
  const plotToggleButton = shell.querySelector("[data-heatmap-plot-toggle]");
  const zoomInButton = shell.querySelector("[data-heatmap-zoom-in]");
  const zoomOutButton = shell.querySelector("[data-heatmap-zoom-out]");
  const resetButton = shell.querySelector("[data-heatmap-reset-view]");
  const fullscreenButton = shell.querySelector("[data-heatmap-fullscreen-toggle]");
  const zoomLabel = shell.querySelector("[data-heatmap-zoom-label]");
  const rangeLabel = shell.querySelector("[data-heatmap-range-label]");
  const minStat = shell.querySelector("[data-heatmap-stat-min]");
  const maxStat = shell.querySelector("[data-heatmap-stat-max]");
  const rangeStat = shell.querySelector("[data-heatmap-stat-range]");
  let linkedPlotPanel = shell.querySelector("[data-heatmap-linked-plot]");
  let linkedPlotTitle = shell.querySelector("[data-heatmap-linked-title]");
  let linkedPlotShellHost = shell.querySelector("[data-heatmap-linked-shell-host]");
  let linkedPlotRowButton = shell.querySelector('[data-heatmap-plot-axis="row"]');
  let linkedPlotColButton = shell.querySelector('[data-heatmap-plot-axis="col"]');
  let linkedPlotCloseButton = shell.querySelector("[data-heatmap-plot-close]");
  const statusElement =
    shell.closest(".data-section")?.querySelector("[data-heatmap-status]") || null;

  if (!canvasHost || !canvas) {
    return;
  }

  const fileKey = shell.dataset.heatmapFileKey || "";
  const fileEtag = shell.dataset.heatmapFileEtag || "";
  const path = shell.dataset.heatmapPath || "/";
  const displayDims = shell.dataset.heatmapDisplayDims || "";
  const fixedIndices = shell.dataset.heatmapFixedIndices || "";
  const selectionKey =
    shell.dataset.heatmapSelectionKey ||
    buildHeatmapSelectionKey(fileKey, path, displayDims, fixedIndices);
  const cacheKey = `${selectionKey}|${fileEtag || "no-etag"}`;
  const colormap = shell.dataset.heatmapColormap || "viridis";
  const showGrid = shell.dataset.heatmapGrid !== "0";
  const lineNotation = shell.dataset.heatmapLineNotation || "auto";
  const lineGrid = shell.dataset.heatmapLineGrid !== "0";
  const lineAspect = shell.dataset.heatmapLineAspect || "line";

  if (!fileKey) {
    setMatrixStatus(statusElement, "No heatmap data available.", "error");
    return;
  }

  if (!linkedPlotPanel || !linkedPlotTitle || !linkedPlotShellHost) {
    const linkedPanelMarkup = `
      <div class="heatmap-linked-plot" data-heatmap-linked-plot="true" hidden>
        <div class="heatmap-linked-plot-header">
          <div class="heatmap-linked-plot-title" data-heatmap-linked-title="true">
            Plot mode: click a heatmap cell to inspect row/column profiles.
          </div>
          <div class="heatmap-linked-plot-actions">
            <button type="button" class="line-tool-btn" data-heatmap-plot-axis="row">Row</button>
            <button type="button" class="line-tool-btn" data-heatmap-plot-axis="col">Column</button>
            <button
              type="button"
              class="line-tool-btn line-tool-btn-icon"
              data-heatmap-plot-close="true"
              aria-label="Close plot"
              title="Close plot"
            >
              <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M4 4l8 8M12 4l-8 8"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="heatmap-linked-plot-shell-host" data-heatmap-linked-shell-host="true"></div>
      </div>
    `;
    const statsNode = shell.querySelector(".line-stats");
    if (statsNode) {
      statsNode.insertAdjacentHTML("beforebegin", linkedPanelMarkup);
    } else {
      shell.insertAdjacentHTML("beforeend", linkedPanelMarkup);
    }
    linkedPlotPanel = shell.querySelector("[data-heatmap-linked-plot]");
    linkedPlotTitle = shell.querySelector("[data-heatmap-linked-title]");
    linkedPlotShellHost = shell.querySelector("[data-heatmap-linked-shell-host]");
    linkedPlotRowButton = shell.querySelector('[data-heatmap-plot-axis="row"]');
    linkedPlotColButton = shell.querySelector('[data-heatmap-plot-axis="col"]');
    linkedPlotCloseButton = shell.querySelector("[data-heatmap-plot-close]");
  }

  shell.dataset.heatmapBound = "true";

  const runtime = {
    fileKey,
    fileEtag,
    path,
    displayDims,
    fixedIndices,
    selectionKey,
    cacheKey,
    colormap,
    showGrid,
    zoom: 1,
    panX: 0,
    panY: 0,
    panEnabled: false,
    plottingEnabled: false,
    isPanning: false,
    panPointerId: null,
    panStartX: 0,
    panStartY: 0,
    panStartOffsetX: 0,
    panStartOffsetY: 0,
    rows: 0,
    cols: 0,
    values: null,
    min: 0,
    max: 1,
    bitmap: null,
    maxSizeClamped: false,
    effectiveMaxSize: HEATMAP_MAX_SIZE,
    layout: null,
    hover: null,
    hoverDisplayRow: null,
    selectedCell: null,
    plotAxis: "row",
    linkedPlotOpen: false,
    linkedLineCleanup: null,
    activeCancelKeys: new Set(),
    destroyed: false,
    loadedPhase: "preview",
    fullscreenActive: false,
  };

  if (consumeHeatmapFullscreenRestore(selectionKey)) {
    runtime.fullscreenActive = true;
  }

  function updateLabels() {
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(runtime.zoom * 100)}%`;
    }
    if (rangeLabel) {
      rangeLabel.textContent =
        runtime.rows > 0 && runtime.cols > 0
          ? `Grid: ${runtime.rows.toLocaleString()} x ${runtime.cols.toLocaleString()}`
          : "Grid: --";
    }
    if (minStat) {
      minStat.textContent = `min: ${formatCell(runtime.min)}`;
    }
    if (maxStat) {
      maxStat.textContent = `max: ${formatCell(runtime.max)}`;
    }
    if (rangeStat) {
      rangeStat.textContent =
        runtime.rows > 0 && runtime.cols > 0
          ? `size: ${(runtime.rows * runtime.cols).toLocaleString()} cells`
          : "size: --";
    }
  }

  function persistViewState() {
    const persistedCell =
      runtime.selectedCell &&
      Number.isFinite(runtime.selectedCell.row) &&
      Number.isFinite(runtime.selectedCell.col)
        ? {
            row: runtime.selectedCell.row,
            col: runtime.selectedCell.col,
          }
        : null;
    HEATMAP_SELECTION_VIEW_CACHE.set(runtime.cacheKey, {
      zoom: runtime.zoom,
      panX: runtime.panX,
      panY: runtime.panY,
      panEnabled: runtime.panEnabled === true,
      plottingEnabled: runtime.plottingEnabled === true,
      plotAxis: runtime.plotAxis === "col" ? "col" : "row",
      linkedPlotOpen: runtime.linkedPlotOpen === true && persistedCell !== null,
      selectedCell: persistedCell,
    });
    if (HEATMAP_SELECTION_VIEW_CACHE.size > HEATMAP_SELECTION_CACHE_LIMIT) {
      const oldestKey = HEATMAP_SELECTION_VIEW_CACHE.keys().next().value;
      if (oldestKey) {
        HEATMAP_SELECTION_VIEW_CACHE.delete(oldestKey);
      }
    }
  }

  function buildLoadedStatusText(phase = runtime.loadedPhase) {
    const prefix = phase === "highres" ? "High-res heatmap loaded" : "Preview heatmap loaded";
    let statusText = `${prefix} (${runtime.rows.toLocaleString()} x ${runtime.cols.toLocaleString()}).`;
    statusText += " Wheel to zoom. Use Hand to pan.";
    if (runtime.maxSizeClamped && phase === "highres") {
      statusText += ` Clamped to ${runtime.effectiveMaxSize}.`;
    }
    return statusText;
  }

  function clampPanForZoom(panX, panY, zoomLevel = runtime.zoom) {
    const layout = runtime.layout;
    if (!layout || zoomLevel <= HEATMAP_MIN_ZOOM) {
      return { x: 0, y: 0 };
    }
    const minX = layout.chartWidth - layout.chartWidth * zoomLevel;
    const minY = layout.chartHeight - layout.chartHeight * zoomLevel;
    return {
      x: clamp(panX, minX, 0),
      y: clamp(panY, minY, 0),
    };
  }

  function restoreCachedHeatmapData() {
    // Rehydrate last rendered bitmap data and viewport so quick back/forth selection feels instant.
    const cachedData = HEATMAP_SELECTION_DATA_CACHE.get(runtime.cacheKey);
    if (!cachedData) {
      return false;
    }

    const grid = {
      rows: Math.max(0, Number(cachedData.rows) || 0),
      cols: Math.max(0, Number(cachedData.cols) || 0),
      values: cachedData.values,
    };
    if (!grid.rows || !grid.cols || !(grid.values instanceof Float64Array)) {
      return false;
    }

    const cachedMin = Number(cachedData.min);
    const cachedMax = Number(cachedData.max);
    const min = Number.isFinite(cachedMin) ? cachedMin : 0;
    const max = Number.isFinite(cachedMax) && cachedMax !== min ? cachedMax : min + 1;
    const bitmap = createHeatmapBitmap(grid, min, max, runtime.colormap);
    if (!bitmap) {
      return false;
    }

    runtime.rows = grid.rows;
    runtime.cols = grid.cols;
    runtime.values = grid.values;
    runtime.min = min;
    runtime.max = max;
    runtime.bitmap = bitmap;
    runtime.maxSizeClamped = cachedData.maxSizeClamped === true;
    runtime.effectiveMaxSize = Number(cachedData.effectiveMaxSize) || HEATMAP_MAX_SIZE;
    runtime.loadedPhase = cachedData.phase === "highres" ? "highres" : "preview";

    // View cache stores interaction state (zoom/pan/plot mode/selection), separate from pixel data cache.
    const cachedView = HEATMAP_SELECTION_VIEW_CACHE.get(runtime.cacheKey);
    if (cachedView && typeof cachedView === "object") {
      runtime.zoom = clamp(Number(cachedView.zoom) || HEATMAP_MIN_ZOOM, HEATMAP_MIN_ZOOM, HEATMAP_MAX_ZOOM);
      runtime.panX = Number(cachedView.panX) || 0;
      runtime.panY = Number(cachedView.panY) || 0;
      runtime.panEnabled = cachedView.panEnabled === true;
      runtime.plottingEnabled = cachedView.plottingEnabled === true;
      runtime.plotAxis = cachedView.plotAxis === "col" ? "col" : "row";
      runtime.selectedCell = normalizeSelectedCell(cachedView.selectedCell);
      runtime.linkedPlotOpen = cachedView.linkedPlotOpen === true && runtime.selectedCell !== null;
    } else {
      runtime.zoom = HEATMAP_MIN_ZOOM;
      runtime.panX = 0;
      runtime.panY = 0;
      runtime.plottingEnabled = false;
      runtime.plotAxis = "row";
      runtime.selectedCell = null;
      runtime.linkedPlotOpen = false;
    }

    hideTooltip();
    updateLabels();
    setPanState();
    renderHeatmap();

    const clampedPan = clampPanForZoom(runtime.panX, runtime.panY, runtime.zoom);
    runtime.panX = clampedPan.x;
    runtime.panY = clampedPan.y;
    renderHeatmap();
    persistViewState();

    if (runtime.linkedPlotOpen && runtime.selectedCell) {
      renderLinkedPlotLine();
    }

    setMatrixStatus(statusElement, buildLoadedStatusText(runtime.loadedPhase), "info");
    return true;
  }

  function setLinkedPlotTitle(cell = runtime.selectedCell) {
    if (!linkedPlotTitle) {
      return;
    }

    if (!cell) {
      linkedPlotTitle.textContent = "Plot mode: click a heatmap cell to inspect row/column profiles.";
      return;
    }

    const modeText = runtime.plotAxis === "col" ? "Column profile" : "Row profile";
    const axisText =
      runtime.plotAxis === "col"
        ? `Col ${cell.col} across Y`
        : `Y ${cell.displayRow} across columns`;
    const selectedText = `Selected Y ${cell.displayRow}, Col ${cell.col}`;
    linkedPlotTitle.textContent = `${modeText}: ${axisText} | ${selectedText} | Value ${formatCell(
      cell.value,
      "auto"
    )}`;
  }

  function syncLinkedPlotLayoutState() {
    const linkedVisible = Boolean(linkedPlotPanel && linkedPlotPanel.hidden === false);
    shell.classList.toggle("has-linked-plot", linkedVisible);
  }

  function syncPlotAxisButtons() {
    if (linkedPlotRowButton) {
      linkedPlotRowButton.classList.toggle("active", runtime.plotAxis === "row");
    }
    if (linkedPlotColButton) {
      linkedPlotColButton.classList.toggle("active", runtime.plotAxis === "col");
    }
  }

  function clearLinkedLineRuntime() {
    if (typeof runtime.linkedLineCleanup === "function") {
      try {
        runtime.linkedLineCleanup();
      } catch (_error) {
        // ignore cleanup errors for detached nodes
      }
    }
    runtime.linkedLineCleanup = null;
    if (linkedPlotShellHost) {
      linkedPlotShellHost.innerHTML = "";
    }
  }

  function closeLinkedPlot() {
    runtime.selectedCell = null;
    runtime.linkedPlotOpen = false;
    clearLinkedLineRuntime();
    if (linkedPlotPanel) {
      linkedPlotPanel.hidden = true;
      linkedPlotPanel.classList.remove("is-visible");
    }
    syncLinkedPlotLayoutState();
    setLinkedPlotTitle(null);
    syncPlotAxisButtons();
    renderHeatmap();
  }

  function openLinkedPlot() {
    runtime.linkedPlotOpen = true;
    if (linkedPlotPanel) {
      linkedPlotPanel.hidden = false;
      linkedPlotPanel.classList.add("is-visible");
    }
    syncLinkedPlotLayoutState();
  }

  function isScrollableY(element) {
    if (typeof window === "undefined" || !element) {
      return false;
    }
    const style = window.getComputedStyle(element);
    const overflowY = (style.overflowY || "").toLowerCase();
    const canScrollY =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    return canScrollY && element.scrollHeight > element.clientHeight + 1;
  }

  function resolveLinkedPlotScrollHost() {
    let current = linkedPlotPanel ? linkedPlotPanel.parentElement : null;
    while (current) {
      if (isScrollableY(current)) {
        return current;
      }
      current = current.parentElement;
    }
    if (typeof document !== "undefined" && document.scrollingElement) {
      return document.scrollingElement;
    }
    return null;
  }

  function scrollLinkedPlotIntoView(smooth = true) {
    if (
      runtime.destroyed ||
      runtime.fullscreenActive ||
      !linkedPlotPanel ||
      linkedPlotPanel.hidden
    ) {
      return;
    }

    const scrollHost = resolveLinkedPlotScrollHost();
    const rootScroller =
      typeof document !== "undefined"
        ? document.scrollingElement || document.documentElement || document.body
        : null;
    if (scrollHost && scrollHost !== rootScroller) {
      const panelRect = linkedPlotPanel.getBoundingClientRect();
      const hostRect = scrollHost.getBoundingClientRect();
      const margin = 12;
      const outsideViewport =
        panelRect.top < hostRect.top + margin || panelRect.bottom > hostRect.bottom - margin;
      if (!outsideViewport) {
        return;
      }
      const targetTop = Math.max(
        0,
        scrollHost.scrollTop + (panelRect.top - hostRect.top) - margin
      );
      try {
        scrollHost.scrollTo({
          top: targetTop,
          behavior: smooth ? "smooth" : "auto",
        });
      } catch (_error) {
        scrollHost.scrollTop = targetTop;
      }
      return;
    }

    try {
      linkedPlotPanel.scrollIntoView({
        block: "start",
        inline: "nearest",
        behavior: smooth ? "smooth" : "auto",
      });
    } catch (_error) {
      linkedPlotPanel.scrollIntoView(true);
    }
  }

  function revealLinkedPlotIntoView() {
    scrollLinkedPlotIntoView(false);
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => scrollLinkedPlotIntoView(true));
    } else {
      scrollLinkedPlotIntoView(true);
    }
    setTimeout(() => scrollLinkedPlotIntoView(false), 220);
  }

  function normalizeSelectedCell(cell) {
    if (!cell) {
      return null;
    }
    const row = clamp(Number(cell.row), 0, Math.max(0, runtime.rows - 1));
    const col = clamp(Number(cell.col), 0, Math.max(0, runtime.cols - 1));
    const value =
      runtime.values && runtime.rows > 0 && runtime.cols > 0
        ? runtime.values[row * runtime.cols + col]
        : cell.value;
    return {
      row,
      col,
      value,
      displayRow: toDisplayRow(runtime.rows, row),
    };
  }

  function selectCellForPlot(cell) {
    const normalized = normalizeSelectedCell(cell);
    if (!normalized) {
      return false;
    }

    const isSameSelection =
      runtime.selectedCell &&
      runtime.selectedCell.row === normalized.row &&
      runtime.selectedCell.col === normalized.col &&
      linkedPlotPanel &&
      linkedPlotPanel.hidden === false;

    runtime.selectedCell = normalized;
    runtime.linkedPlotOpen = true;
    persistViewState();
    setMatrixStatus(
      statusElement,
      `Plot selected at Y ${normalized.displayRow}, Col ${normalized.col}. Loading line profile...`,
      "info"
    );
    renderHeatmap();
    if (!isSameSelection) {
      renderLinkedPlotLine({ revealPanel: true });
    } else {
      setLinkedPlotTitle(runtime.selectedCell);
      syncPlotAxisButtons();
    }
    return true;
  }

  function resolveFallbackHoverCell() {
    if (!runtime.hover) {
      return null;
    }
    return {
      row: runtime.hover.row,
      col: runtime.hover.col,
      value: runtime.hover.value,
      displayRow: toDisplayRow(runtime.rows, runtime.hover.row),
    };
  }

  function renderLinkedPlotLine(options = {}) {
    if (!runtime.selectedCell || !linkedPlotShellHost) {
      return;
    }

    const lineDim = runtime.plotAxis === "col" ? "col" : "row";
    const lineIndex = lineDim === "col" ? runtime.selectedCell.col : runtime.selectedCell.row;
    const selectedPointIndex = lineDim === "col" ? runtime.selectedCell.row : runtime.selectedCell.col;
    const totalPoints = lineDim === "col" ? runtime.rows : runtime.cols;
    if (!Number.isFinite(lineIndex) || totalPoints <= 0) {
      return;
    }

    const lineSelectionKey = [
      runtime.selectionKey,
      "heatmap-plot",
      lineDim,
      runtime.selectedCell.row,
      runtime.selectedCell.col,
    ].join("|");

    openLinkedPlot();
    setLinkedPlotTitle(runtime.selectedCell);
    syncPlotAxisButtons();
    clearLinkedLineRuntime();

    linkedPlotShellHost.innerHTML = renderLinkedLineShellMarkup({
      fileKey: runtime.fileKey,
      fileEtag: runtime.fileEtag,
      path: runtime.path,
      displayDims: runtime.displayDims,
      fixedIndices: runtime.fixedIndices,
      selectionKey: lineSelectionKey,
      totalPoints,
      lineIndex,
      lineDim,
      selectedPointIndex,
      notation: lineNotation,
      lineGrid,
      lineAspect,
    });

    const lineShell = linkedPlotShellHost.querySelector("[data-line-shell]");
    if (!lineShell) {
      setMatrixStatus(statusElement, "Failed to mount linked line chart panel.", "error");
      return;
    }
    const cleanup = initializeLineRuntime(lineShell);
    runtime.linkedLineCleanup =
      typeof cleanup === "function"
        ? cleanup
        : typeof lineShell.__lineRuntimeCleanup === "function"
        ? lineShell.__lineRuntimeCleanup
        : null;
    persistViewState();
    if (options.revealPanel === true) {
      revealLinkedPlotIntoView();
    }
  }

  function setPanState() {
    canvasHost.classList.toggle("is-pan", runtime.panEnabled);
    canvasHost.classList.toggle("is-grabbing", runtime.isPanning);
    canvasHost.classList.toggle("is-plot", runtime.plottingEnabled);
    const cursor = runtime.isPanning
      ? "grabbing"
      : runtime.panEnabled
      ? "grab"
      : runtime.plottingEnabled
      ? "crosshair"
      : "default";
    canvasHost.style.cursor = cursor;
    canvas.style.cursor = cursor;
    if (panToggleButton) {
      panToggleButton.classList.toggle("active", runtime.panEnabled);
    }
    if (plotToggleButton) {
      plotToggleButton.classList.toggle("active", runtime.plottingEnabled);
      const label = runtime.plottingEnabled ? "Disable plotting" : "Plotting";
      plotToggleButton.setAttribute("aria-label", label);
      plotToggleButton.setAttribute("title", label);
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
    renderHeatmap();
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

  function hideTooltip() {
    if (tooltip) {
      tooltip.hidden = true;
    }
    runtime.hover = null;
    runtime.hoverDisplayRow = null;
  }

  function resizeCanvasForHost(context) {
    // Use canvas rect (content-box) instead of canvasHost rect to avoid
    // border-induced sizing/coordinate mismatch.
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || 320));
    const height = Math.max(240, Math.floor(rect.height || 240));
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.floor(width * dpr));
    const targetHeight = Math.max(1, Math.floor(height * dpr));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  function renderHeatmap() {
    if (runtime.destroyed) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const { width, height } = resizeCanvasForHost(context);
    const layout = getLayout(width, height);
    runtime.layout = layout;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#F8FAFF";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#FFFFFF";
    context.fillRect(layout.chartX, layout.chartY, layout.chartWidth, layout.chartHeight);

    if (runtime.bitmap) {
      const drawX = layout.chartX + runtime.panX;
      const drawY = layout.chartY + runtime.panY;
      const drawWidth = layout.chartWidth * runtime.zoom;
      const drawHeight = layout.chartHeight * runtime.zoom;

      context.save();
      context.beginPath();
      context.rect(layout.chartX, layout.chartY, layout.chartWidth, layout.chartHeight);
      context.clip();
      context.imageSmoothingEnabled = false;
      context.drawImage(runtime.bitmap, drawX, drawY, drawWidth, drawHeight);

      if (
        runtime.showGrid &&
        runtime.zoom >= 2 &&
        runtime.rows > 0 &&
        runtime.cols > 0 &&
        runtime.rows <= 240 &&
        runtime.cols <= 240
      ) {
        const cellWidth = layout.chartWidth / runtime.cols;
        const cellHeight = layout.chartHeight / runtime.rows;
        context.save();
        context.translate(drawX, drawY);
        context.scale(runtime.zoom, runtime.zoom);
        context.strokeStyle = "rgba(255,255,255,0.35)";
        context.lineWidth = 1 / runtime.zoom;
        for (let row = 0; row <= runtime.rows; row += 1) {
          const y = row * cellHeight;
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(layout.chartWidth, y);
          context.stroke();
        }
        for (let col = 0; col <= runtime.cols; col += 1) {
          const x = col * cellWidth;
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, layout.chartHeight);
          context.stroke();
        }
        context.restore();
      }

      if (runtime.hover && runtime.rows > 0 && runtime.cols > 0) {
        const cellWidth = (layout.chartWidth / runtime.cols) * runtime.zoom;
        const cellHeight = (layout.chartHeight / runtime.rows) * runtime.zoom;
        const x = drawX + runtime.hover.col * cellWidth;
        const y = drawY + runtime.hover.row * cellHeight;
        context.strokeStyle = "rgba(255,255,255,0.95)";
        context.lineWidth = 1.25;
        context.strokeRect(x, y, cellWidth, cellHeight);
      }

      if (runtime.selectedCell && runtime.rows > 0 && runtime.cols > 0) {
        const cellWidth = (layout.chartWidth / runtime.cols) * runtime.zoom;
        const cellHeight = (layout.chartHeight / runtime.rows) * runtime.zoom;
        const x = drawX + runtime.selectedCell.col * cellWidth;
        const y = drawY + runtime.selectedCell.row * cellHeight;
        const chartLeft = layout.chartX;
        const chartTop = layout.chartY;
        const chartRight = layout.chartX + layout.chartWidth;
        const chartBottom = layout.chartY + layout.chartHeight;
        const rectRight = x + cellWidth;
        const rectBottom = y + cellHeight;
        const intersectsViewport =
          rectRight >= chartLeft &&
          x <= chartRight &&
          rectBottom >= chartTop &&
          y <= chartBottom;

        if (intersectsViewport) {
          const safeCellWidth = Math.max(1, cellWidth);
          const safeCellHeight = Math.max(1, cellHeight);
          const centerX = x + cellWidth / 2;
          const centerY = y + cellHeight / 2;
          const markerRadius = clamp(Math.min(cellWidth, cellHeight) * 0.5, 4, 9);
          const markerCrossHalf = markerRadius + 3;
          const showSelectionGuides = runtime.linkedPlotOpen || runtime.plottingEnabled;

          if (showSelectionGuides) {
            context.save();
            context.setLineDash([6, 4]);
            context.strokeStyle = "rgba(217,119,6,0.58)";
            context.lineWidth = 1.1;
            context.beginPath();
            context.moveTo(centerX, chartTop);
            context.lineTo(centerX, chartBottom);
            context.moveTo(chartLeft, centerY);
            context.lineTo(chartRight, centerY);
            context.stroke();
            context.restore();
          }

          // Keep the selected cell edge visible when the grid is very dense.
          context.strokeStyle = "rgba(217,119,6,0.95)";
          context.lineWidth = Math.max(1.4, 2 / Math.max(runtime.zoom, 1));
          context.strokeRect(x, y, safeCellWidth, safeCellHeight);

          // Draw a fixed-size center marker so selection remains visible at sub-pixel cell sizes.
          context.strokeStyle = "rgba(255,255,255,0.92)";
          context.lineWidth = 2.4;
          context.beginPath();
          context.arc(centerX, centerY, markerRadius + 1.2, 0, Math.PI * 2);
          context.stroke();

          context.strokeStyle = "rgba(217,119,6,0.98)";
          context.lineWidth = 1.8;
          context.beginPath();
          context.arc(centerX, centerY, markerRadius, 0, Math.PI * 2);
          context.stroke();

          context.strokeStyle = "rgba(15,23,42,0.76)";
          context.lineWidth = 1.2;
          context.beginPath();
          context.moveTo(centerX - markerCrossHalf, centerY);
          context.lineTo(centerX + markerCrossHalf, centerY);
          context.moveTo(centerX, centerY - markerCrossHalf);
          context.lineTo(centerX, centerY + markerCrossHalf);
          context.stroke();

          context.fillStyle = "rgba(217,119,6,1)";
          context.beginPath();
          context.arc(centerX, centerY, 2.6, 0, Math.PI * 2);
          context.fill();

          if (runtime.linkedPlotOpen) {
            const selectedBadge = `Sel Y ${runtime.selectedCell.displayRow}, C ${runtime.selectedCell.col}`;
            const maxBadgeWidth = Math.max(72, layout.chartWidth - 8);
            context.font = "700 10px 'Segoe UI', Arial, sans-serif";
            const measured = Math.ceil(context.measureText(selectedBadge).width) + 14;
            const badgeWidth = Math.min(maxBadgeWidth, Math.max(72, measured));
            const badgeX = layout.chartX + 6;
            const badgeY = layout.chartY + 6;
            context.fillStyle = "rgba(15,23,42,0.78)";
            context.fillRect(badgeX, badgeY, badgeWidth, 17);
            context.fillStyle = "#FFFFFF";
            context.textAlign = "left";
            context.textBaseline = "middle";
            context.fillText(selectedBadge, badgeX + 7, badgeY + 8.5);
            context.textBaseline = "alphabetic";
          }
        }
      }
      context.restore();
    }

    context.strokeStyle = "#D9E2F2";
    context.lineWidth = 1;
    context.strokeRect(layout.chartX, layout.chartY, layout.chartWidth, layout.chartHeight);

    context.font = "600 10px 'Segoe UI', Arial, sans-serif";
    context.fillStyle = "#475569";
    context.textAlign = "center";
    // Viewport-aware axis ticks: update as user zooms/pans.
    const xTicks = runtime.zoom > 1
      ? buildViewportTicks(runtime.cols, runtime.panX, runtime.zoom, layout.chartWidth)
      : buildTicks(runtime.cols).map((col) => ({
          dataIndex: col,
          screenRatio: runtime.cols <= 1 ? 0.5 : col / (runtime.cols - 1),
        }));
    const yTicks = runtime.zoom > 1
      ? buildViewportTicks(runtime.rows, runtime.panY, runtime.zoom, layout.chartHeight)
      : buildTicks(runtime.rows).map((row) => ({
          dataIndex: row,
          screenRatio: runtime.rows <= 1 ? 0.5 : row / (runtime.rows - 1),
        }));
    xTicks.forEach((tick) => {
      const x = layout.chartX + tick.screenRatio * layout.chartWidth;
      context.fillText(String(tick.dataIndex), x, layout.chartY + layout.chartHeight + 14);
    });
    context.textAlign = "right";
    yTicks.forEach((tick) => {
      const y = layout.chartY + tick.screenRatio * layout.chartHeight + 3;
      const yLabel = toDisplayRow(runtime.rows, tick.dataIndex);
      context.fillText(String(yLabel), layout.chartX - 8, y);
    });

    const gradient = context.createLinearGradient(
      0,
      layout.colorBarY + layout.chartHeight,
      0,
      layout.colorBarY
    );
    const stops = getColorStops(runtime.colormap);
    stops.forEach((color, index) => {
      const offset = index / Math.max(1, stops.length - 1);
      gradient.addColorStop(offset, `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
    });

    context.fillStyle = gradient;
    context.fillRect(
      layout.colorBarX,
      layout.colorBarY,
      layout.colorBarWidth,
      layout.chartHeight
    );
    context.strokeStyle = "#D9E2F2";
    context.strokeRect(
      layout.colorBarX,
      layout.colorBarY,
      layout.colorBarWidth,
      layout.chartHeight
    );

    context.textAlign = "left";
    context.fillStyle = "#475569";
    context.fillText(formatScaleValue(runtime.max), layout.colorBarX + layout.colorBarWidth + 6, layout.colorBarY + 8);
    context.fillText(
      formatScaleValue((runtime.min + runtime.max) / 2),
      layout.colorBarX + layout.colorBarWidth + 6,
      layout.colorBarY + layout.chartHeight / 2 + 3
    );
    context.fillText(
      formatScaleValue(runtime.min),
      layout.colorBarX + layout.colorBarWidth + 6,
      layout.colorBarY + layout.chartHeight - 2
    );
  }

  function applyZoom(nextZoom, anchorX = null, anchorY = null) {
    const clampedZoom = clamp(nextZoom, HEATMAP_MIN_ZOOM, HEATMAP_MAX_ZOOM);
    if (Math.abs(clampedZoom - runtime.zoom) < 0.0005) {
      return;
    }

    const layout = runtime.layout;
    if (!layout) {
      runtime.zoom = clampedZoom;
      runtime.panX = 0;
      runtime.panY = 0;
      updateLabels();
      renderHeatmap();
      persistViewState();
      return;
    }

    const safeAnchorX = Number.isFinite(anchorX) ? anchorX : layout.chartWidth / 2;
    const safeAnchorY = Number.isFinite(anchorY) ? anchorY : layout.chartHeight / 2;
    const scale = clampedZoom / runtime.zoom;
    const nextPanX = safeAnchorX - (safeAnchorX - runtime.panX) * scale;
    const nextPanY = safeAnchorY - (safeAnchorY - runtime.panY) * scale;

    runtime.zoom = clampedZoom;
    const clampedPan = clampPanForZoom(nextPanX, nextPanY, clampedZoom);
    runtime.panX = clampedPan.x;
    runtime.panY = clampedPan.y;
    updateLabels();
    renderHeatmap();
    persistViewState();
  }

  function getRelativePoint(event) {
    // Use canvas rect so coordinates match exactly what is drawn on the
    // canvas, avoiding the 1px (or more) border offset from canvasHost.
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function resolveCellAtPoint(point) {
    const layout = runtime.layout;
    if (!layout || runtime.rows <= 0 || runtime.cols <= 0 || !runtime.values) {
      return null;
    }

    const localX = point.x - layout.chartX;
    const localY = point.y - layout.chartY;
    if (localX < 0 || localX > layout.chartWidth || localY < 0 || localY > layout.chartHeight) {
      return null;
    }

    const scaledX = (localX - runtime.panX) / runtime.zoom;
    const scaledY = (localY - runtime.panY) / runtime.zoom;
    if (
      scaledX < 0 ||
      scaledX > layout.chartWidth ||
      scaledY < 0 ||
      scaledY > layout.chartHeight
    ) {
      return null;
    }

    const col = clamp(Math.floor((scaledX / layout.chartWidth) * runtime.cols), 0, runtime.cols - 1);
    const row = clamp(Math.floor((scaledY / layout.chartHeight) * runtime.rows), 0, runtime.rows - 1);
    const value = runtime.values[row * runtime.cols + col];
    return {
      row,
      col,
      value,
      displayRow: toDisplayRow(runtime.rows, row),
    };
  }

  function updateHover(point) {
    const cell = resolveCellAtPoint(point);
    if (!cell) {
      hideTooltip();
      renderHeatmap();
      return;
    }

    runtime.hover = { row: cell.row, col: cell.col, value: cell.value };
    runtime.hoverDisplayRow = cell.displayRow;

    if (tooltip) {
      // Use canvas rect for tooltip clamping: keeps coordinates consistent.
      // with getRelativePoint() which is also canvas-relative.
      const canvasRect = canvas.getBoundingClientRect();
      const hasSelectedCell = runtime.selectedCell && Number.isFinite(runtime.selectedCell.row);
      const selectedDiffers =
        hasSelectedCell &&
        (runtime.selectedCell.row !== cell.row || runtime.selectedCell.col !== cell.col);
      const maxTooltipWidth = selectedDiffers ? 190 : 156;
      const maxTooltipHeight = selectedDiffers ? 90 : 72;
      const left = clamp(point.x + 12, 8, Math.max(8, canvasRect.width - maxTooltipWidth));
      const top = clamp(point.y + 12, 8, Math.max(8, canvasRect.height - maxTooltipHeight));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.right = "auto";
      tooltip.hidden = false;
      tooltip.innerHTML = `
        <div>Y: ${runtime.hoverDisplayRow}</div>
        <div>Col: ${cell.col}</div>
        <div>Value: ${formatCell(cell.value, "auto")}</div>
        ${
          selectedDiffers
            ? `<div>Sel: Y ${runtime.selectedCell.displayRow}, C ${runtime.selectedCell.col}</div>`
            : ""
        }
      `;
    }

    renderHeatmap();
  }

  async function fetchHeatmapAtSize(maxSize, loadingMessage) {
    if (runtime.destroyed) {
      return { loaded: false };
    }

    if (loadingMessage) {
      setMatrixStatus(statusElement, loadingMessage, "info");
    }

    const requestedMaxSize = Math.max(1, Math.min(maxSize, HEATMAP_MAX_SIZE));
    const cancelKey = `heatmap:${runtime.selectionKey}:${requestedMaxSize}`;
    runtime.activeCancelKeys.add(cancelKey);

    const params = {
      mode: "heatmap",
      max_size: requestedMaxSize,
      include_stats: 0,
    };
    if (runtime.displayDims) {
      params.display_dims = runtime.displayDims;
    }
    if (runtime.fixedIndices) {
      params.fixed_indices = runtime.fixedIndices;
    }

    if (runtime.fileEtag) {
      params.etag = runtime.fileEtag;
    }

    try {
      const response = await getFileData(runtime.fileKey, runtime.path, params, {
        cancelPrevious: true,
        cancelKey,
      });

      if (runtime.destroyed) {
        return { loaded: false };
      }

      const grid = normalizeHeatmapGrid(response?.data);
      if (!grid) {
        throw new Error("No valid heatmap matrix returned from API");
      }

      const statsMin = toFiniteNumber(response?.stats?.min);
      const statsMax = toFiniteNumber(response?.stats?.max);
      const min = statsMin !== null ? statsMin : grid.min;
      let max = statsMax !== null ? statsMax : grid.max;
      if (!(max > min)) {
        max = min + 1;
      }

      const bitmap = createHeatmapBitmap(grid, min, max, runtime.colormap);
      if (!bitmap) {
        throw new Error("Failed to build heatmap canvas");
      }

      runtime.rows = grid.rows;
      runtime.cols = grid.cols;
      runtime.values = grid.values;
      runtime.min = min;
      runtime.max = max;
      runtime.bitmap = bitmap;
      runtime.zoom = HEATMAP_MIN_ZOOM;
      runtime.panX = 0;
      runtime.panY = 0;
      runtime.maxSizeClamped = response?.max_size_clamped === true;
      runtime.effectiveMaxSize = Number(response?.effective_max_size) || requestedMaxSize;
      runtime.loadedPhase = requestedMaxSize >= HEATMAP_MAX_SIZE ? "highres" : "preview";

      if (runtime.selectedCell && runtime.rows > 0 && runtime.cols > 0) {
        const nextRow = clamp(runtime.selectedCell.row, 0, runtime.rows - 1);
        const nextCol = clamp(runtime.selectedCell.col, 0, runtime.cols - 1);
        const nextValue = runtime.values[nextRow * runtime.cols + nextCol];
        runtime.selectedCell = {
          row: nextRow,
          col: nextCol,
          value: nextValue,
          displayRow: toDisplayRow(runtime.rows, nextRow),
        };
      }

      HEATMAP_SELECTION_DATA_CACHE.set(runtime.cacheKey, {
        rows: runtime.rows,
        cols: runtime.cols,
        values: runtime.values,
        min: runtime.min,
        max: runtime.max,
        maxSizeClamped: runtime.maxSizeClamped,
        effectiveMaxSize: runtime.effectiveMaxSize,
        phase: runtime.loadedPhase,
      });
      if (HEATMAP_SELECTION_DATA_CACHE.size > HEATMAP_SELECTION_CACHE_LIMIT) {
        const oldestKey = HEATMAP_SELECTION_DATA_CACHE.keys().next().value;
        if (oldestKey) {
          HEATMAP_SELECTION_DATA_CACHE.delete(oldestKey);
        }
      }

      hideTooltip();
      updateLabels();
      renderHeatmap();
      persistViewState();
      if (runtime.selectedCell && linkedPlotPanel && !linkedPlotPanel.hidden) {
        renderLinkedPlotLine();
      }

      setMatrixStatus(statusElement, buildLoadedStatusText(runtime.loadedPhase), "info");
      return { loaded: true };
    } catch (error) {
      if (runtime.destroyed) {
        return { loaded: false };
      }
      if (error?.isAbort || error?.code === "ABORTED") {
        return { loaded: false };
      }
      setMatrixStatus(statusElement, error?.message || "Failed to load high-res heatmap.", "error");
      return { loaded: false };
    } finally {
      runtime.activeCancelKeys.delete(cancelKey);
    }
  }

  async function loadHighResHeatmap() {
    // Progressive loading: fast preview first (256), then full resolution (1024)
    const PREVIEW_SIZE = 256;
    const previewResult = await fetchHeatmapAtSize(PREVIEW_SIZE, "Loading heatmap preview...");
    if (runtime.destroyed) return;
    if (previewResult.loaded && HEATMAP_MAX_SIZE > PREVIEW_SIZE) {
      // Small delay so the user sees the preview before the full load starts
      await new Promise((r) => setTimeout(r, 50));
      if (runtime.destroyed) return;
      await fetchHeatmapAtSize(HEATMAP_MAX_SIZE, "Loading full resolution...");
    } else if (!previewResult.loaded) {
      // Fallback: try full size directly
      await fetchHeatmapAtSize(HEATMAP_MAX_SIZE, "Loading high-res heatmap...");
    }
  }

  async function exportCsvDisplayed() {
    if (runtime.destroyed) {
      throw new Error("Heatmap runtime is no longer active.");
    }
    if (!(runtime.values instanceof Float64Array) || runtime.rows <= 0 || runtime.cols <= 0) {
      throw new Error("No rendered heatmap grid available for CSV export.");
    }

    setMatrixStatus(statusElement, "Preparing displayed heatmap CSV...", "info");
    const header = ["row\\col"];
    for (let col = 0; col < runtime.cols; col += 1) {
      header.push(col);
    }
    const rows = [toCsvRow(header)];

    for (let row = 0; row < runtime.rows; row += 1) {
      const values = [row];
      const offset = row * runtime.cols;
      for (let col = 0; col < runtime.cols; col += 1) {
        values.push(runtime.values[offset + col]);
      }
      rows.push(toCsvRow(values));
    }

    const filename = buildExportFilename({
      fileKey: runtime.fileKey,
      path: runtime.path,
      tab: "heatmap",
      scope: "displayed",
      extension: "csv",
    });
    const blob = createCsvBlob(rows, true);
    triggerBlobDownload(blob, filename);
    setMatrixStatus(
      statusElement,
      `Displayed heatmap CSV exported (${runtime.rows.toLocaleString()} x ${runtime.cols.toLocaleString()}).`,
      "info"
    );
  }

  async function exportCsvFull() {
    if (runtime.destroyed) {
      throw new Error("Heatmap runtime is no longer active.");
    }

    const query = {
      path: runtime.path,
      mode: "heatmap",
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

    const url = buildCsvExportUrl(runtime.fileKey, query);
    triggerUrlDownload(url);
    setMatrixStatus(statusElement, "Full heatmap CSV download started.", "info");
  }

  async function exportPng() {
    if (runtime.destroyed) {
      throw new Error("Heatmap runtime is no longer active.");
    }
    const pngBlob = await canvasElementToPngBlob(canvas);
    const filename = buildExportFilename({
      fileKey: runtime.fileKey,
      path: runtime.path,
      tab: "heatmap",
      scope: "current",
      extension: "png",
    });
    triggerBlobDownload(pngBlob, filename);
    setMatrixStatus(statusElement, "Heatmap PNG exported.", "info");
  }

  shell.__exportApi = {
    exportCsvDisplayed,
    exportCsvFull,
    exportPng,
  };

  function cancelInFlightRequests() {
    // Runtime owns cancel keys so teardown can stop pending async updates safely.
    runtime.activeCancelKeys.forEach((cancelKey) => {
      cancelPendingRequest(cancelKey, "heatmap-runtime-disposed");
    });
    runtime.activeCancelKeys.clear();
  }

  function onWheel(event) {
    event.preventDefault();
    const point = getRelativePoint(event);
    const layout = runtime.layout;
    if (!layout) {
      return;
    }
    const anchorX = clamp(point.x - layout.chartX, 0, layout.chartWidth);
    const anchorY = clamp(point.y - layout.chartY, 0, layout.chartHeight);
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    applyZoom(runtime.zoom * factor, anchorX, anchorY);
  }

  function onPointerDown(event) {
    const isMousePointer = !event.pointerType || event.pointerType === "mouse";
    if (isMousePointer && event.button !== 0) {
      return;
    }

    if (runtime.plottingEnabled && !runtime.panEnabled) {
      const point = getRelativePoint(event);
      const cell = resolveCellAtPoint(point) || resolveFallbackHoverCell();
      const selected = selectCellForPlot(cell);
      if (selected) {
        event.preventDefault();
      }
      return;
    }

    if (!runtime.panEnabled) {
      return;
    }
    event.preventDefault();
    const point = getRelativePoint(event);
    runtime.isPanning = true;
    runtime.panPointerId = event.pointerId;
    runtime.panStartX = point.x;
    runtime.panStartY = point.y;
    runtime.panStartOffsetX = runtime.panX;
    runtime.panStartOffsetY = runtime.panY;
    setPanState();
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const point = getRelativePoint(event);
    if (runtime.isPanning && runtime.panPointerId === event.pointerId) {
      event.preventDefault();
      const deltaX = point.x - runtime.panStartX;
      const deltaY = point.y - runtime.panStartY;
      const nextPan = clampPanForZoom(
        runtime.panStartOffsetX + deltaX,
        runtime.panStartOffsetY + deltaY,
        runtime.zoom
      );
      runtime.panX = nextPan.x;
      runtime.panY = nextPan.y;
      renderHeatmap();
      persistViewState();
      return;
    }
    updateHover(point);
  }

  function stopPan(event = null) {
    if (!runtime.isPanning) {
      return;
    }
    if (event && runtime.panPointerId !== event.pointerId) {
      return;
    }
    const activePointer = runtime.panPointerId;
    runtime.isPanning = false;
    runtime.panPointerId = null;
    setPanState();
    if (Number.isFinite(activePointer) && canvas.hasPointerCapture(activePointer)) {
      canvas.releasePointerCapture(activePointer);
    }
  }

  function onPointerUp(event) {
    const wasPanning =
      runtime.isPanning &&
      Number.isFinite(runtime.panPointerId) &&
      runtime.panPointerId === event.pointerId;
    stopPan(event);

    if (wasPanning || !runtime.plottingEnabled || runtime.panEnabled) {
      return;
    }
    const isMousePointer = !event.pointerType || event.pointerType === "mouse";
    if (isMousePointer && event.button !== 0) {
      return;
    }

    const point = getRelativePoint(event);
    const cell = resolveCellAtPoint(point) || resolveFallbackHoverCell();
    selectCellForPlot(cell);
  }

  function onCanvasClick(event) {
    if (!runtime.plottingEnabled || runtime.panEnabled || runtime.isPanning) {
      return;
    }
    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }

    const point = getRelativePoint(event);
    const cell = resolveCellAtPoint(point) || resolveFallbackHoverCell();
    selectCellForPlot(cell);
  }

  function onPointerLeave() {
    if (runtime.isPanning) {
      stopPan();
    }
    hideTooltip();
    renderHeatmap();
  }

  function onTogglePan() {
    runtime.panEnabled = !runtime.panEnabled;
    if (!runtime.panEnabled && runtime.isPanning) {
      stopPan();
    }
    if (runtime.panEnabled) {
      runtime.plottingEnabled = false;
    }
    if (runtime.panEnabled && runtime.zoom <= HEATMAP_MIN_ZOOM + 0.001) {
      applyZoom(HEATMAP_PAN_START_ZOOM);
    }
    setPanState();
    persistViewState();
  }

  function onTogglePlotMode() {
    runtime.plottingEnabled = !runtime.plottingEnabled;
    if (runtime.plottingEnabled) {
      runtime.panEnabled = false;
      if (runtime.isPanning) {
        stopPan();
      }
      setMatrixStatus(
        statusElement,
        "Plot mode enabled. Click a heatmap cell to show row/column line profiles.",
        "info"
      );
    } else {
      setMatrixStatus(statusElement, buildLoadedStatusText(runtime.loadedPhase), "info");
    }
    setPanState();
    persistViewState();
  }

  function onPlotToggleClick(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    onTogglePlotMode();
  }

  function onShellClick(event) {
    if (!event || event.defaultPrevented) {
      return;
    }
    const toggleButton = event.target?.closest?.("[data-heatmap-plot-toggle]");
    if (toggleButton && shell.contains(toggleButton)) {
      event.preventDefault();
      onTogglePlotMode();
    }
  }

  function onSelectRowAxis() {
    runtime.plotAxis = "row";
    syncPlotAxisButtons();
    persistViewState();
    if (runtime.selectedCell) {
      renderLinkedPlotLine();
    } else {
      setLinkedPlotTitle(null);
    }
  }

  function onSelectColAxis() {
    runtime.plotAxis = "col";
    syncPlotAxisButtons();
    persistViewState();
    if (runtime.selectedCell) {
      renderLinkedPlotLine();
    } else {
      setLinkedPlotTitle(null);
    }
  }

  function onCloseLinkedPlot(event) {
    if (event) {
      event.preventDefault();
    }
    closeLinkedPlot();
    persistViewState();
  }

  function onResetView() {
    if (runtime.isPanning) {
      stopPan();
    }
    runtime.zoom = HEATMAP_MIN_ZOOM;
    runtime.panX = 0;
    runtime.panY = 0;
    runtime.panEnabled = false;
    hideTooltip();
    setPanState();
    updateLabels();
    renderHeatmap();
    persistViewState();
  }

  function onZoomIn() {
    applyZoom(runtime.zoom * 1.15);
  }

  function onZoomOut() {
    applyZoom(runtime.zoom / 1.15);
  }

  function onToggleFullscreen() {
    runtime.fullscreenActive = !runtime.fullscreenActive;
    if (!runtime.fullscreenActive) {
      heatmapFullscreenRestore = null;
    }
    syncFullscreenState();
    rerenderAfterFullscreenChange();
  }

  function onFullscreenEsc(event) {
    if (event.key === "Escape" && runtime.fullscreenActive) {
      event.preventDefault();
      event.stopPropagation();
      runtime.fullscreenActive = false;
      heatmapFullscreenRestore = null;
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

  const onFullscreenClick = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    onToggleFullscreen();
  };

  if (linkedPlotPanel) {
    linkedPlotPanel.hidden = true;
    linkedPlotPanel.classList.remove("is-visible");
  }
  syncLinkedPlotLayoutState();
  setLinkedPlotTitle(null);
  syncPlotAxisButtons();
  setPanState();
  syncFullscreenState();
  const restoredFromCache = restoreCachedHeatmapData();
  if (!restoredFromCache) {
    updateLabels();
    renderHeatmap();
    void loadHighResHeatmap();
  }

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", stopPan);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvasHost.addEventListener("click", onCanvasClick);
  if (panToggleButton) panToggleButton.addEventListener("click", onTogglePan);
  if (plotToggleButton) plotToggleButton.addEventListener("click", onPlotToggleClick);
  if (zoomInButton) zoomInButton.addEventListener("click", onZoomIn);
  if (zoomOutButton) zoomOutButton.addEventListener("click", onZoomOut);
  if (resetButton) resetButton.addEventListener("click", onResetView);
  if (fullscreenButton) fullscreenButton.addEventListener("click", onFullscreenClick);
  if (linkedPlotRowButton) linkedPlotRowButton.addEventListener("click", onSelectRowAxis);
  if (linkedPlotColButton) linkedPlotColButton.addEventListener("click", onSelectColAxis);
  if (linkedPlotCloseButton) linkedPlotCloseButton.addEventListener("click", onCloseLinkedPlot);
  shell.addEventListener("click", onShellClick);
  document.addEventListener("keydown", onFullscreenEsc);

  let resizeObserver = null;
  const onWindowResize = () => {
    renderHeatmap();
  };
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(onWindowResize);
    resizeObserver.observe(canvasHost);
  } else {
    window.addEventListener("resize", onWindowResize);
  }

  const cleanup = () => {
    persistViewState();
    runtime.destroyed = true;
    if (shell.__exportApi) {
      delete shell.__exportApi;
    }
    cancelInFlightRequests();
    closeLinkedPlot();
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", stopPan);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvasHost.removeEventListener("click", onCanvasClick);
    if (panToggleButton) panToggleButton.removeEventListener("click", onTogglePan);
    if (plotToggleButton) plotToggleButton.removeEventListener("click", onPlotToggleClick);
    if (zoomInButton) zoomInButton.removeEventListener("click", onZoomIn);
    if (zoomOutButton) zoomOutButton.removeEventListener("click", onZoomOut);
    if (resetButton) resetButton.removeEventListener("click", onResetView);
    if (fullscreenButton) fullscreenButton.removeEventListener("click", onFullscreenClick);
    if (linkedPlotRowButton) linkedPlotRowButton.removeEventListener("click", onSelectRowAxis);
    if (linkedPlotColButton) linkedPlotColButton.removeEventListener("click", onSelectColAxis);
    if (linkedPlotCloseButton) linkedPlotCloseButton.removeEventListener("click", onCloseLinkedPlot);
    shell.removeEventListener("click", onShellClick);
    document.removeEventListener("keydown", onFullscreenEsc);
    if (runtime.fullscreenActive) {
      rememberHeatmapFullscreen(runtime.selectionKey);
    }
    exitPanelFullscreen();
    runtime.fullscreenActive = false;
    setDocumentFullscreenLock(false);
    shell.classList.remove("is-fullscreen");
    canvasHost.style.cursor = "";
    canvas.style.cursor = "";
    if (resizeObserver) {
      resizeObserver.disconnect();
    } else {
      window.removeEventListener("resize", onWindowResize);
    }
  };

  HEATMAP_RUNTIME_CLEANUPS.add(cleanup);
}
  if (typeof initializeHeatmapRuntime !== "undefined") {
    moduleState.initializeHeatmapRuntime = initializeHeatmapRuntime;
    global.initializeHeatmapRuntime = initializeHeatmapRuntime;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("components/viewerPanel/runtime/heatmapRuntime");
  }
})(typeof window !== "undefined" ? window : globalThis);

