// Viewer HTML module: Builds display and inspect sections, toolbars, and virtual runtime shells with data attributes.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for components/viewerPanel/render/sections.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading components/viewerPanel/render/sections.");
    return;
  }
  var moduleState = ensurePath(ns, "components.viewerPanel.render.sections");

// Renders the correct SVG icon for a toolbar button based on its kind string
function renderToolIcon(kind) {
  if (kind === "pan") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 1v14M1 8h14M8 1 6.3 2.7M8 1l1.7 1.7M8 15l-1.7-1.7M8 15l1.7-1.7M1 8l1.7-1.7M1 8l1.7 1.7M15 8l-1.7-1.7M15 8l-1.7 1.7"></path>
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
  if (kind === "zoom-click") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="4.5"></circle>
        <path d="M10.4 10.4 14 14M7 5v4M5 7h4"></path>
        <path d="M2.2 2.2 4.2 4.2"></path>
      </svg>
    `;
  }
  if (kind === "plot") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="5.5"></circle>
        <path d="M8 4.6v6.8M4.6 8h6.8"></path>
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
  if (kind === "close") {
    return `
      <svg class="line-tool-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M4 4l8 8M12 4l-8 8"></path>
      </svg>
    `;
  }
  return "";
}

function renderIconToolButton(label, dataAttr, kind) {
  return `
    <button
      type="button"
      class="line-tool-btn line-tool-btn-icon"
      ${dataAttr}="true"
      aria-label="${label}"
      title="${label}"
    >
      ${renderToolIcon(kind)}
    </button>
  `;
}

function renderVirtualLineShell(state, config, preview) {
  const compareItems = Array.isArray(state.lineCompareItems)
    ? state.lineCompareItems
        .filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            String(entry.path || "") &&
            String(entry.path || "") !== String(state.selectedPath || "")
        )
        .map((entry) => ({
          path: String(entry.path || ""),
          name: String(entry.name || entry.path || ""),
          dtype: String(entry.dtype || ""),
          ndim: Number(entry.ndim),
          shape: Array.isArray(entry.shape) ? entry.shape : [],
        }))
    : [];
  const compareItemsPayload = encodeURIComponent(JSON.stringify(compareItems));
  const baseShape = Array.isArray(preview?.shape) ? preview.shape.join(",") : "";
  const baseNdim = Number.isFinite(Number(preview?.ndim))
    ? Number(preview.ndim)
    : Array.isArray(preview?.shape)
    ? preview.shape.length
    : 0;
  const baseDtype = preview?.dtype || "";
  return `
    <div
      class="line-chart-shell line-chart-shell-full"
      data-line-shell="true"
      data-line-file-key="${escapeHtml(state.selectedFile || "")}"
      data-line-file-etag="${escapeHtml(state.selectedFileEtag || "")}"
      data-line-path="${escapeHtml(state.selectedPath || "/")}"
      data-line-display-dims="${escapeHtml(config.displayDimsParam || "")}"
      data-line-fixed-indices="${escapeHtml(config.fixedIndicesParam || "")}"
      data-line-selection-key="${escapeHtml(config.selectionKey || "")}"
      data-line-total-points="${config.totalPoints}"
      data-line-index="${config.lineIndex ?? ""}"
      data-line-compare-items="${escapeHtml(compareItemsPayload)}"
      data-line-base-shape="${escapeHtml(baseShape)}"
      data-line-base-ndim="${baseNdim}"
      data-line-base-dtype="${escapeHtml(baseDtype)}"
      data-line-notation="${escapeHtml(state.notation || "auto")}"
      data-line-grid="${state.lineGrid ? "1" : "0"}"
      data-line-aspect="${escapeHtml(state.lineAspect || "line")}"
      data-line-quality="${LINE_DEFAULT_QUALITY}"
      data-line-overview-max-points="${LINE_DEFAULT_OVERVIEW_MAX_POINTS}"
      data-line-exact-max-points="${LINE_EXACT_MAX_POINTS}"
    >
      <div class="line-chart-toolbar">
        <div class="line-tool-group">
          ${renderIconToolButton("Hand", "data-line-pan-toggle", "pan")}
          ${renderIconToolButton("Zoom on click", "data-line-zoom-click-toggle", "zoom-click")}
          ${renderIconToolButton("Zoom in", "data-line-zoom-in", "zoom-in")}
          ${renderIconToolButton("Zoom out", "data-line-zoom-out", "zoom-out")}
          ${renderIconToolButton("Reset view", "data-line-reset-view", "reset")}
        </div>
        <div class="line-tool-group">
          <button type="button" class="line-tool-btn" data-line-jump-start="true">Start</button>
          <button type="button" class="line-tool-btn" data-line-step-prev="true">Prev</button>
          <button type="button" class="line-tool-btn" data-line-step-next="true">Next</button>
          <button type="button" class="line-tool-btn" data-line-jump-end="true">End</button>
        </div>
        <div class="line-tool-group">
          <span class="line-zoom-label" data-line-zoom-label="true">100%</span>
          ${renderIconToolButton("Fullscreen", "data-line-fullscreen-toggle", "fullscreen")}
          <span class="line-zoom-label" data-line-range-label="true">Range: --</span>
        </div>
      </div>
      <div class="line-chart-stage">
        <div class="line-chart-canvas" data-line-canvas="true" tabindex="0" role="application" aria-label="Line chart">
          <svg
            viewBox="0 0 ${LINE_SVG_WIDTH} ${LINE_SVG_HEIGHT}"
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
      <div class="line-legend" data-line-legend="true" hidden></div>
    </div>
  `;
}

function renderLineSection(state, preview) {
  const config = resolveLineRuntimeConfig(state, preview);
  const canLoadFull = config.supported && config.totalPoints > 0;
  const isEnabled = state.lineFullEnabled === true && canLoadFull;

  const statusText = !config.supported
    ? config.rowCount === 0
      ? "Line full view requires at least 1 row in the selected Y dimension."
      : "Line full view is unavailable for this dataset."
    : config.totalPoints <= 0
    ? "No values available for line rendering."
    : isEnabled
    ? "Wheel to zoom. Use Hand to pan."
    : "Preview mode. Click Load full line.";
  const statusTone = !config.supported || config.totalPoints <= 0 ? "error" : "info";
  const statusClass = `data-status ${statusTone === "error" ? "error" : "info"}`;
  const compareEnabled = state.lineCompareEnabled === true;
  const compareItems = Array.isArray(state.lineCompareItems)
    ? state.lineCompareItems.filter(
        (entry) => String(entry?.path || "") && String(entry?.path || "") !== String(state.selectedPath || "")
      )
    : [];
  const compareStatus =
    state.lineCompareStatus &&
    typeof state.lineCompareStatus === "object" &&
    state.lineCompareStatus.message
      ? state.lineCompareStatus
      : null;
  const compareStatusClass = compareStatus
    ? `line-compare-status ${compareStatus.tone === "error" ? "error" : "info"}`
    : "";
  const canUseCompare = canLoadFull;

  const content = isEnabled
    ? renderVirtualLineShell(state, config, preview)
    : renderLinePreview(preview, {
        lineGrid: state.lineGrid,
        lineAspect: state.lineAspect,
      });

  return `
    <div class="data-section">
      <div class="data-actions">
        <button
          type="button"
          class="data-btn"
          data-line-enable="true"
          ${!canLoadFull || isEnabled ? "disabled" : ""}
        >
          Load full line
        </button>
        <button
          type="button"
          class="data-btn ${compareEnabled ? "active" : ""}"
          data-line-compare-toggle="true"
          ${canUseCompare ? "" : "disabled"}
        >
          Compare ${compareEnabled ? "On" : "Off"}
        </button>
        <button
          type="button"
          class="data-btn"
          data-line-compare-clear="true"
          ${compareItems.length > 0 ? "" : "disabled"}
        >
          Clear compare
        </button>
        <span class="${statusClass}" data-line-status="true">${escapeHtml(statusText)}</span>
      </div>
      <div class="line-compare-panel">
        <div class="line-compare-panel-label">
          ${
            compareEnabled
              ? "Compare mode enabled. Use dataset row Compare buttons in the tree."
              : "Enable compare mode to select extra datasets from the tree."
          }
        </div>
        <div class="line-compare-chip-list">
          ${
            compareItems.length > 0
              ? compareItems
                  .map(
                    (entry) => `
                <span class="line-compare-chip">
                  <span class="line-compare-chip-label" title="${escapeHtml(
                    String(entry.path || "")
                  )}">${escapeHtml(String(entry.name || entry.path || ""))}</span>
                  <button
                    type="button"
                    class="line-compare-chip-remove"
                    data-line-compare-remove="${escapeHtml(String(entry.path || ""))}"
                    aria-label="Remove ${escapeHtml(String(entry.name || entry.path || ""))} from compare"
                    title="Remove"
                  >
                    x
                  </button>
                </span>
              `
                  )
                  .join("")
              : `<span class="line-compare-empty">No comparison datasets selected.</span>`
          }
        </div>
        ${
          compareStatus
            ? `<div class="${compareStatusClass}">
                <span>${escapeHtml(String(compareStatus.message || ""))}</span>
                <button type="button" class="line-compare-status-dismiss" data-line-compare-dismiss="true">Dismiss</button>
              </div>`
            : ""
        }
      </div>
      ${content}
    </div>
  `;
}

function renderVirtualMatrixShell(state, config) {
  const totalWidth = MATRIX_INDEX_WIDTH + config.cols * MATRIX_COL_WIDTH;
  const totalHeight = MATRIX_HEADER_HEIGHT + config.rows * MATRIX_ROW_HEIGHT;

  return `
    <div
      class="matrix-table-shell"
      data-matrix-shell="true"
      data-matrix-rows="${config.rows}"
      data-matrix-cols="${config.cols}"
      data-matrix-block-rows="${config.blockRows}"
      data-matrix-block-cols="${config.blockCols}"
      data-matrix-file-key="${escapeHtml(state.selectedFile || "")}"
      data-matrix-file-etag="${escapeHtml(state.selectedFileEtag || "")}"
      data-matrix-path="${escapeHtml(state.selectedPath || "/")}"
      data-matrix-display-dims="${escapeHtml(config.displayDimsParam || "")}"
      data-matrix-fixed-indices="${escapeHtml(config.fixedIndicesParam || "")}"
      data-matrix-selection-key="${escapeHtml(config.selectionKey || "")}"
      data-matrix-notation="${escapeHtml(state.notation || "auto")}"
    >
      <div class="matrix-table" data-matrix-table="true">
        <div class="matrix-spacer" style="width:${totalWidth}px;height:${totalHeight}px;"></div>
        <div class="matrix-header" style="width:${totalWidth}px;height:${MATRIX_HEADER_HEIGHT}px;">
          <div class="matrix-header-corner" style="width:${MATRIX_INDEX_WIDTH}px;"></div>
          <div
            class="matrix-header-cells"
            data-matrix-header-cells="true"
            style="width:${config.cols * MATRIX_COL_WIDTH}px;height:${MATRIX_HEADER_HEIGHT}px;"
          ></div>
        </div>
        <div
          class="matrix-index"
          data-matrix-index="true"
          style="width:${MATRIX_INDEX_WIDTH}px;height:${config.rows * MATRIX_ROW_HEIGHT}px;"
        ></div>
        <div
          class="matrix-cells"
          data-matrix-cells="true"
          style="width:${config.cols * MATRIX_COL_WIDTH}px;height:${config.rows * MATRIX_ROW_HEIGHT}px;"
        ></div>
      </div>
    </div>
  `;
}

function renderMatrixSection(state, preview) {
  const config = resolveMatrixRuntimeConfig(state, preview);
  const canLoadFull = config.supported && config.rows > 0 && config.cols > 0;
  const isEnabled = state.matrixFullEnabled === true && canLoadFull;

  const statusText = !config.supported
    ? "Full matrix view requires at least 2 dimensions."
    : config.rows <= 0 || config.cols <= 0
    ? "No values available for the selected display dims."
    : isEnabled
    ? "Streaming blocks as you scroll."
    : "Preview mode. Click Load full view.";
  const statusTone = !config.supported || config.rows <= 0 || config.cols <= 0 ? "error" : "info";
  const statusClass = `data-status ${statusTone === "error" ? "error" : "info"}`;

  const content = isEnabled
    ? renderVirtualMatrixShell(state, config)
    : renderTablePreview(preview, state.notation || "auto");

  return `
    <div class="data-section">
      <div class="data-actions">
        <button
          type="button"
          class="data-btn"
          data-matrix-enable="true"
          ${!canLoadFull || isEnabled ? "disabled" : ""}
        >
          Load full view
        </button>
        <span class="${statusClass}" data-matrix-status="true">${escapeHtml(statusText)}</span>
      </div>
      ${content}
    </div>
  `;
}

function renderVirtualHeatmapShell(state, config) {
  return `
    <div
      class="line-chart-shell heatmap-chart-shell"
      data-heatmap-shell="true"
      data-heatmap-file-key="${escapeHtml(state.selectedFile || "")}"
      data-heatmap-file-etag="${escapeHtml(state.selectedFileEtag || "")}"
      data-heatmap-path="${escapeHtml(state.selectedPath || "/")}"
      data-heatmap-display-dims="${escapeHtml(config.displayDimsParam || "")}"
      data-heatmap-fixed-indices="${escapeHtml(config.fixedIndicesParam || "")}"
      data-heatmap-selection-key="${escapeHtml(config.selectionKey || "")}"
      data-heatmap-colormap="${escapeHtml(state.heatmapColormap || "viridis")}"
      data-heatmap-grid="${state.heatmapGrid ? "1" : "0"}"
      data-heatmap-line-notation="${escapeHtml(state.notation || "auto")}"
      data-heatmap-line-grid="${state.lineGrid ? "1" : "0"}"
      data-heatmap-line-aspect="${escapeHtml(state.lineAspect || "line")}"
    >
      <div class="line-chart-toolbar heatmap-chart-toolbar">
        <div class="line-tool-group">
          ${renderIconToolButton("Hand", "data-heatmap-pan-toggle", "pan")}
          ${renderIconToolButton("Plotting", "data-heatmap-plot-toggle", "plot")}
          ${renderIconToolButton("Zoom in", "data-heatmap-zoom-in", "zoom-in")}
          ${renderIconToolButton("Zoom out", "data-heatmap-zoom-out", "zoom-out")}
          ${renderIconToolButton("Reset view", "data-heatmap-reset-view", "reset")}
        </div>
        <div class="line-tool-group">
          <span class="line-zoom-label" data-heatmap-zoom-label="true">100%</span>
          ${renderIconToolButton("Fullscreen", "data-heatmap-fullscreen-toggle", "fullscreen")}
          <span class="line-zoom-label" data-heatmap-range-label="true">Grid: --</span>
        </div>
      </div>
      <div class="line-chart-stage">
        <div
          class="line-chart-canvas heatmap-chart-canvas"
          data-heatmap-canvas="true"
          tabindex="0"
          role="application"
          aria-label="Heatmap chart"
        >
          <canvas class="heatmap-canvas" data-heatmap-surface="true"></canvas>
          <div class="line-hover" data-heatmap-hover="true" hidden></div>
        </div>
      </div>
      <div class="heatmap-linked-plot" data-heatmap-linked-plot="true" hidden>
        <div class="heatmap-linked-plot-header">
          <div class="heatmap-linked-plot-title" data-heatmap-linked-title="true">
            Plot mode: click a heatmap cell to inspect row/column profiles.
          </div>
          <div class="heatmap-linked-plot-actions">
            <button type="button" class="line-tool-btn" data-heatmap-plot-axis="row">Row</button>
            <button type="button" class="line-tool-btn" data-heatmap-plot-axis="col">Column</button>
            ${renderIconToolButton("Close plot", "data-heatmap-plot-close", "close")}
          </div>
        </div>
        <div class="heatmap-linked-plot-shell-host" data-heatmap-linked-shell-host="true"></div>
      </div>
      <div class="line-stats">
        <span data-heatmap-stat-min="true">min: --</span>
        <span data-heatmap-stat-max="true">max: --</span>
        <span data-heatmap-stat-range="true">size: --</span>
      </div>
    </div>
  `;
}

function renderHeatmapSection(state, preview) {
  const config = resolveHeatmapRuntimeConfig(state, preview);
  const canLoadHighRes = config.supported && config.rows > 0 && config.cols > 0;
  const isEnabled = state.heatmapFullEnabled === true && canLoadHighRes;

  const statusText = !config.supported
    ? "Heatmap high-res view requires at least 2 dimensions."
    : config.rows <= 0 || config.cols <= 0
    ? "No values available for the selected display dims."
    : isEnabled
    ? "Wheel to zoom. Use Hand to pan."
    : "Preview mode. Click Load high-res.";
  const statusTone = !config.supported || config.rows <= 0 || config.cols <= 0 ? "error" : "info";
  const statusClass = `data-status ${statusTone === "error" ? "error" : "info"}`;

  const content = isEnabled
    ? renderVirtualHeatmapShell(state, config)
    : renderHeatmapPreview(preview, {
        heatmapColormap: state.heatmapColormap,
        heatmapGrid: state.heatmapGrid,
      });

  return `
    <div class="data-section">
      <div class="data-actions">
        <button
          type="button"
          class="data-btn"
          data-heatmap-enable="true"
          ${!canLoadHighRes || isEnabled ? "disabled" : ""}
        >
          Load high-res
        </button>
        <span class="${statusClass}" data-heatmap-status="true">${escapeHtml(statusText)}</span>
      </div>
      ${content}
    </div>
  `;
}

function renderDisplayContent(state) {
  const hasSelection = state.selectedNodeType === "dataset" && state.selectedPath !== "/";
  const activeTab = state.displayTab || "line";
  const preview = state.preview;

  if (!hasSelection) {
    return `
      <div class="panel-state">
        <div class="state-text">Select a dataset from the tree to view a preview.</div>
      </div>
    `;
  }

  if (state.previewLoading) {
    return `
      <div class="panel-state">
        <div class="loading-spinner"></div>
        <div class="state-text">Loading preview...</div>
      </div>
    `;
  }

  if (state.previewError) {
    return `
      <div class="panel-state error">
        <div class="state-text error-text">${escapeHtml(state.previewError)}</div>
      </div>
    `;
  }

  if (!preview) {
    return `
      <div class="panel-state">
        <div class="state-text">No preview available yet.</div>
      </div>
    `;
  }

  let dataSection = renderMatrixSection(state, preview);
  if (activeTab === "line") {
    dataSection = renderLineSection(state, preview);
  } else if (activeTab === "heatmap") {
    dataSection = renderHeatmapSection(state, preview);
  }

  const isLineFixedLayout = activeTab === "line" && state.lineFullEnabled === true;

  return `
    <div class="preview-shell ${isLineFixedLayout ? "preview-shell-line-fixed" : ""}">
      <div class="preview-layout ${activeTab === "line" ? "is-line" : ""}">
        ${renderDimensionControls(state, preview)}
        <div class="preview-content">
          ${dataSection}
        </div>
      </div>
    </div>
  `;
}

function renderMetadataPanelContent(state, options) {
  // The SPA sidebar and any legacy inspect callers both consume this markup,
  // so keep metadata presentation logic centralized here.
  const opts = options && typeof options === "object" ? options : {};
  const wrapperClass = opts.wrapperClass ? ` ${opts.wrapperClass}` : "";
  const hasSelection =
    state.selectedPath !== "/" ||
    state.metadataLoading ||
    Boolean(state.metadata) ||
    Boolean(state.metadataError);

  if (!hasSelection) {
    return `
      <div class="panel-state${wrapperClass}">
        <div class="state-text">Select an item from the tree to view its metadata.</div>
      </div>
    `;
  }

  if (state.metadataLoading) {
    return `
      <div class="panel-state${wrapperClass}">
        <div class="loading-spinner"></div>
        <div class="state-text">Loading metadata...</div>
      </div>
    `;
  }

  if (state.metadataError) {
    return `
      <div class="panel-state error${wrapperClass}">
        <div class="state-text error-text">${escapeHtml(state.metadataError)}</div>
      </div>
    `;
  }

  const meta = state.metadata;
  if (!meta) {
    return `
      <div class="panel-state${wrapperClass}">
        <div class="state-text">No metadata available.</div>
      </div>
    `;
  }

  const infoRows = [
    ["Name", meta.name || "(root)", false],
    ["Path", meta.path || state.selectedPath, true],
    ["Kind", meta.kind || state.selectedNodeType || "--", false],
  ];

  if (meta.num_children !== undefined) {
    infoRows.push(["Children", meta.num_children, false]);
  }

  if (meta.type) {
    infoRows.push(["Type", formatTypeDescription(meta.type), false]);
  }

  if (meta.shape) {
    infoRows.push(["Shape", `[${formatValue(meta.shape)}]`, true]);
  }

  if (meta.ndim !== undefined) {
    infoRows.push(["Dimensions", `${meta.ndim}D`, false]);
  }

  if (meta.size !== undefined) {
    infoRows.push(["Total Elements", Number(meta.size).toLocaleString(), false]);
  }

  if (meta.dtype) {
    infoRows.push(["DType", meta.dtype, true]);
  }

  if (meta.chunks) {
    infoRows.push(["Chunks", `[${formatValue(meta.chunks)}]`, true]);
  }

  if (meta.compression) {
    infoRows.push([
      "Compression",
      `${meta.compression}${meta.compression_opts ? ` (level ${meta.compression_opts})` : ""}`,
      false,
    ]);
  }

  return `
    <div class="metadata-simple${wrapperClass}">
      ${infoRows
        .map(
          ([label, value, mono]) => `
            <div class="info-row">
              <span class="info-label">${escapeHtml(String(label))}</span>
              <span class="info-value ${mono ? "mono" : ""}">${escapeHtml(String(value))}</span>
            </div>
          `
        )
        .join("")}
      <div class="info-section-title">Raw JSON</div>
      <pre class="json-view">${escapeHtml(JSON.stringify(meta, null, 2))}</pre>
    </div>
  `;
}

function renderInspectContent(state) {
  return renderMetadataPanelContent(state);
}
  if (typeof renderDisplayContent !== "undefined") {
    moduleState.renderDisplayContent = renderDisplayContent;
    global.renderDisplayContent = renderDisplayContent;
  }
  if (typeof renderMetadataPanelContent !== "undefined") {
    moduleState.renderMetadataPanelContent = renderMetadataPanelContent;
    global.renderMetadataPanelContent = renderMetadataPanelContent;
  }
  if (typeof renderInspectContent !== "undefined") {
    moduleState.renderInspectContent = renderInspectContent;
    global.renderInspectContent = renderInspectContent;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("components/viewerPanel/render/sections");
  }
})(typeof window !== "undefined" ? window : globalThis);
