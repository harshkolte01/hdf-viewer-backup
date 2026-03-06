// Viewer HTML module: Implements virtualized matrix block streaming, viewport rendering, and matrix CSV export actions.
(function (global) {
  "use strict";
  var ns = global.HDFViewer;
  if (!ns) {
    console.error("[HDFViewer] Missing namespace for components/viewerPanel/runtime/matrixRuntime.");
    return;
  }
  var ensurePath = ns.core && ns.core.ensurePath;
  if (typeof ensurePath !== "function") {
    console.error("[HDFViewer] Missing core.ensurePath before loading components/viewerPanel/runtime/matrixRuntime.");
    return;
  }
  var moduleState = ensurePath(ns, "components.viewerPanel.runtime.matrixRuntime");
const MATRIX_MAX_PARALLEL_REQUESTS = 4;

function getCachedMatrixBlock(runtime, rowOffset, colOffset, rowLimit, colLimit) {
  const blockKey = buildMatrixBlockKey(
    runtime.selectionKey,
    rowOffset,
    colOffset,
    rowLimit,
    colLimit
  );
  return MATRIX_BLOCK_CACHE.get(blockKey) || null;
}

function getMatrixCellValue(runtime, row, col) {
  const rowOffset = Math.floor(row / runtime.blockRows) * runtime.blockRows;
  const colOffset = Math.floor(col / runtime.blockCols) * runtime.blockCols;
  const rowLimit = Math.min(runtime.blockRows, runtime.rows - rowOffset);
  const colLimit = Math.min(runtime.blockCols, runtime.cols - colOffset);
  const block = getCachedMatrixBlock(runtime, rowOffset, colOffset, rowLimit, colLimit);

  if (!block || !Array.isArray(block.data)) {
    return null;
  }

  const resolvedRowOffset = toSafeInteger(block.row_offset, rowOffset);
  const resolvedColOffset = toSafeInteger(block.col_offset, colOffset);
  const localRow = row - resolvedRowOffset;
  const localCol = col - resolvedColOffset;
  return block.data?.[localRow]?.[localCol] ?? null;
}

function initializeMatrixRuntime(shell) {
  if (!shell || shell.dataset.matrixBound === "true") {
    return;
  }

  const table = shell.querySelector("[data-matrix-table]");
  const headerCellsLayer = shell.querySelector("[data-matrix-header-cells]");
  const indexLayer = shell.querySelector("[data-matrix-index]");
  const cellsLayer = shell.querySelector("[data-matrix-cells]");
  const statusElement =
    shell.closest(".data-section")?.querySelector("[data-matrix-status]") || null;

  if (!table || !headerCellsLayer || !indexLayer || !cellsLayer) {
    return;
  }

  const rows = Math.max(0, toSafeInteger(shell.dataset.matrixRows, 0));
  const cols = Math.max(0, toSafeInteger(shell.dataset.matrixCols, 0));
  const blockRows = Math.max(1, toSafeInteger(shell.dataset.matrixBlockRows, 160));
  const blockCols = Math.max(1, toSafeInteger(shell.dataset.matrixBlockCols, 40));
  const fileKey = shell.dataset.matrixFileKey || "";
  const fileEtag = shell.dataset.matrixFileEtag || "";
  const path = shell.dataset.matrixPath || "/";
  const displayDims = shell.dataset.matrixDisplayDims || "";
  const fixedIndices = shell.dataset.matrixFixedIndices || "";
  const selectionKey =
    shell.dataset.matrixSelectionKey ||
    buildMatrixSelectionKey(fileKey, path, displayDims, fixedIndices);
  const notation = shell.dataset.matrixNotation || "auto";

  if (!rows || !cols || !fileKey) {
    setMatrixStatus(statusElement, "No matrix data available.", "error");
    return;
  }

  shell.dataset.matrixBound = "true";

  const runtime = {
    rows,
    cols,
    blockRows,
    blockCols,
    fileKey,
    fileEtag,
    path,
    displayDims,
    fixedIndices,
    selectionKey,
    notation,
    pendingCount: 0,
    activeRequestCount: 0,
    loadedBlocks: 0,
    destroyed: false,
    rafToken: null,
    blockQueue: [],
    queuedBlockKeys: new Set(),
    activeCancelKeys: new Set(),
    headerPool: [],
    rowIndexPool: [],
    cellPool: [],
  };

  const visible = {
    rowStart: 0,
    rowEnd: 0,
    colStart: 0,
    colEnd: 0,
  };

  const clampIndex = (value, min, max) => Math.max(min, Math.min(max, value));

  function queueRender() {
    if (runtime.destroyed || runtime.rafToken !== null) {
      return;
    }

    // Render work is collapsed to one frame to keep scroll smooth.
    runtime.rafToken = requestAnimationFrame(() => {
      runtime.rafToken = null;
      renderViewport();
    });
  }

  function updateStatusFromRuntime() {
    if (runtime.pendingCount > 0 || runtime.blockQueue.length > 0) {
      setMatrixStatus(statusElement, "Loading blocks...", "info");
      return;
    }

    setMatrixStatus(
      statusElement,
      runtime.loadedBlocks > 0
        ? `Loaded ${runtime.loadedBlocks} block${runtime.loadedBlocks > 1 ? "s" : ""}.`
        : "Scroll to stream blocks.",
      "info"
    );
  }

  function enqueueBlock(rowOffset, colOffset, rowLimit, colLimit) {
    const safeRowLimit = Math.min(rowLimit, Math.max(0, runtime.rows - rowOffset));
    const safeColLimit = Math.min(colLimit, Math.max(0, runtime.cols - colOffset));

    if (safeRowLimit <= 0 || safeColLimit <= 0) {
      return;
    }

    const blockKey = buildMatrixBlockKey(
      runtime.selectionKey,
      rowOffset,
      colOffset,
      safeRowLimit,
      safeColLimit
    );

    if (
      MATRIX_BLOCK_CACHE.get(blockKey) ||
      MATRIX_PENDING.has(blockKey) ||
      runtime.queuedBlockKeys.has(blockKey)
    ) {
      return;
    }

    runtime.queuedBlockKeys.add(blockKey);
    runtime.blockQueue.push({
      blockKey,
      rowOffset,
      colOffset,
      rowLimit: safeRowLimit,
      colLimit: safeColLimit,
    });
  }

  async function requestBlock(task) {
    const blockKey = task.blockKey;
    MATRIX_PENDING.add(blockKey);
    runtime.pendingCount += 1;
    runtime.activeRequestCount += 1;
    updateStatusFromRuntime();

    const { rowOffset, colOffset, rowLimit: safeRowLimit, colLimit: safeColLimit } = task;
    const cancelKey = `matrix:${runtime.selectionKey}:${rowOffset}:${colOffset}:${safeRowLimit}:${safeColLimit}`;
    runtime.activeCancelKeys.add(cancelKey);

    const params = {
      mode: "matrix",
      row_offset: rowOffset,
      row_limit: safeRowLimit,
      col_offset: colOffset,
      col_limit: safeColLimit,
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
        cancelPrevious: false,
        cancelKey,
      });

      MATRIX_BLOCK_CACHE.set(blockKey, response);
      runtime.loadedBlocks += 1;

      if (!runtime.destroyed) {
        queueRender();
      }
    } catch (error) {
      if (!runtime.destroyed && !(error?.isAbort || error?.code === "ABORTED")) {
        setMatrixStatus(
          statusElement,
          error?.message || "Failed to load matrix block.",
          "error"
        );
      }
    } finally {
      MATRIX_PENDING.delete(blockKey);
      runtime.pendingCount = Math.max(0, runtime.pendingCount - 1);
      runtime.activeRequestCount = Math.max(0, runtime.activeRequestCount - 1);
      runtime.activeCancelKeys.delete(cancelKey);
      if (!runtime.destroyed) {
        updateStatusFromRuntime();
        pumpBlockQueue();
      }
    }
  }

  function pumpBlockQueue() {
    if (runtime.destroyed) {
      return;
    }

    while (
      runtime.activeRequestCount < MATRIX_MAX_PARALLEL_REQUESTS &&
      runtime.blockQueue.length > 0
    ) {
      const nextTask = runtime.blockQueue.shift();
      if (!nextTask) {
        continue;
      }
      runtime.queuedBlockKeys.delete(nextTask.blockKey);
      void requestBlock(nextTask);
    }
  }

  function requestVisibleBlocks() {
    // Rebuild requested block set from current viewport + overscan region.
    runtime.blockQueue = [];
    runtime.queuedBlockKeys.clear();

    const blockRowStart = Math.floor(visible.rowStart / runtime.blockRows) * runtime.blockRows;
    const blockRowEnd = Math.floor(visible.rowEnd / runtime.blockRows) * runtime.blockRows;
    const blockColStart = Math.floor(visible.colStart / runtime.blockCols) * runtime.blockCols;
    const blockColEnd = Math.floor(visible.colEnd / runtime.blockCols) * runtime.blockCols;

    for (let row = blockRowStart; row <= blockRowEnd; row += runtime.blockRows) {
      const rowLimit = Math.min(runtime.blockRows, runtime.rows - row);
      for (let col = blockColStart; col <= blockColEnd; col += runtime.blockCols) {
        const colLimit = Math.min(runtime.blockCols, runtime.cols - col);
        enqueueBlock(row, col, rowLimit, colLimit);
      }
    }

    updateStatusFromRuntime();
    pumpBlockQueue();
  }

  function renderViewport() {
    if (runtime.destroyed) {
      return;
    }

    const viewportWidth = table.clientWidth;
    const viewportHeight = table.clientHeight;
    const scrollTop = table.scrollTop;
    const scrollLeft = table.scrollLeft;

    const contentScrollTop = Math.max(0, scrollTop - MATRIX_HEADER_HEIGHT);
    const contentScrollLeft = Math.max(0, scrollLeft - MATRIX_INDEX_WIDTH);
    const contentHeight = Math.max(0, viewportHeight - MATRIX_HEADER_HEIGHT);
    const contentWidth = Math.max(0, viewportWidth - MATRIX_INDEX_WIDTH);

    // Visible window in matrix cell coordinates (with overscan so fast scroll has preloaded cells).
    visible.rowStart = Math.max(
      0,
      Math.floor(contentScrollTop / MATRIX_ROW_HEIGHT) - MATRIX_OVERSCAN
    );
    visible.rowEnd = Math.min(
      runtime.rows - 1,
      Math.floor((contentScrollTop + contentHeight) / MATRIX_ROW_HEIGHT) + MATRIX_OVERSCAN
    );
    visible.colStart = Math.max(
      0,
      Math.floor(contentScrollLeft / MATRIX_COL_WIDTH) - MATRIX_OVERSCAN
    );
    visible.colEnd = Math.min(
      runtime.cols - 1,
      Math.floor((contentScrollLeft + contentWidth) / MATRIX_COL_WIDTH) + MATRIX_OVERSCAN
    );

    requestVisibleBlocks();

    const visibleCols = [];
    for (let col = visible.colStart; col <= visible.colEnd; col += 1) {
      visibleCols.push(col);
    }

    const visibleRows = [];
    for (let row = visible.rowStart; row <= visible.rowEnd; row += 1) {
      visibleRows.push(row);
    }

    ensureNodePool(
      headerCellsLayer,
      runtime.headerPool,
      visibleCols.length,
      "matrix-cell matrix-cell-header"
    );
    visibleCols.forEach((col, index) => {
      const node = runtime.headerPool[index];
      node.style.left = `${col * MATRIX_COL_WIDTH}px`;
      node.style.width = `${MATRIX_COL_WIDTH}px`;
      node.style.height = `${MATRIX_HEADER_HEIGHT}px`;
      node.textContent = String(col);
    });

    indexLayer.style.transform = "";
    ensureNodePool(
      indexLayer,
      runtime.rowIndexPool,
      visibleRows.length,
      "matrix-cell matrix-cell-index"
    );
    visibleRows.forEach((row, index) => {
      const node = runtime.rowIndexPool[index];
      node.style.left = "0px";
      node.style.top = `${row * MATRIX_ROW_HEIGHT}px`;
      node.style.width = `${MATRIX_INDEX_WIDTH}px`;
      node.style.height = `${MATRIX_ROW_HEIGHT}px`;
      node.textContent = String(row);
    });

    const totalCellCount = visibleRows.length * visibleCols.length;
    ensureNodePool(cellsLayer, runtime.cellPool, totalCellCount, "matrix-cell");

    let cursor = 0;
    visibleRows.forEach((row) => {
      visibleCols.forEach((col) => {
        const node = runtime.cellPool[cursor];
        cursor += 1;

        node.style.top = `${row * MATRIX_ROW_HEIGHT}px`;
        node.style.left = `${col * MATRIX_COL_WIDTH}px`;
        node.style.width = `${MATRIX_COL_WIDTH}px`;
        node.style.height = `${MATRIX_ROW_HEIGHT}px`;

        const value = getMatrixCellValue(runtime, row, col);
        node.textContent = value === null ? "--" : formatCell(value, runtime.notation);
      });
    });
  }

  function getViewportBounds() {
    if (runtime.rows <= 0 || runtime.cols <= 0) {
      return null;
    }

    const viewportWidth = table.clientWidth;
    const viewportHeight = table.clientHeight;
    const scrollTop = table.scrollTop;
    const scrollLeft = table.scrollLeft;

    const contentScrollTop = Math.max(0, scrollTop - MATRIX_HEADER_HEIGHT);
    const contentScrollLeft = Math.max(0, scrollLeft - MATRIX_INDEX_WIDTH);
    const contentHeight = Math.max(0, viewportHeight - MATRIX_HEADER_HEIGHT);
    const contentWidth = Math.max(0, viewportWidth - MATRIX_INDEX_WIDTH);

    const rowStart = clampIndex(Math.floor(contentScrollTop / MATRIX_ROW_HEIGHT), 0, runtime.rows - 1);
    const rowEnd = clampIndex(
      Math.floor((contentScrollTop + Math.max(1, contentHeight) - 1) / MATRIX_ROW_HEIGHT),
      rowStart,
      runtime.rows - 1
    );
    const colStart = clampIndex(Math.floor(contentScrollLeft / MATRIX_COL_WIDTH), 0, runtime.cols - 1);
    const colEnd = clampIndex(
      Math.floor((contentScrollLeft + Math.max(1, contentWidth) - 1) / MATRIX_COL_WIDTH),
      colStart,
      runtime.cols - 1
    );

    return {
      rowStart,
      rowEnd,
      colStart,
      colEnd,
    };
  }

  async function ensureBlocksForRange(rowStart, rowEnd, colStart, colEnd) {
    if (!Number.isFinite(rowStart) || !Number.isFinite(rowEnd) || !Number.isFinite(colStart) || !Number.isFinite(colEnd)) {
      return;
    }

    // Export path fetches missing blocks directly so CSV contains fully resolved viewport values.
    const requests = [];
    const paramsBase = {
      mode: "matrix",
    };
    if (runtime.displayDims) {
      paramsBase.display_dims = runtime.displayDims;
    }
    if (runtime.fixedIndices) {
      paramsBase.fixed_indices = runtime.fixedIndices;
    }
    if (runtime.fileEtag) {
      paramsBase.etag = runtime.fileEtag;
    }

    const startRowBlock = Math.floor(rowStart / runtime.blockRows) * runtime.blockRows;
    const endRowBlock = Math.floor(rowEnd / runtime.blockRows) * runtime.blockRows;
    const startColBlock = Math.floor(colStart / runtime.blockCols) * runtime.blockCols;
    const endColBlock = Math.floor(colEnd / runtime.blockCols) * runtime.blockCols;

    for (let rowOffset = startRowBlock; rowOffset <= endRowBlock; rowOffset += runtime.blockRows) {
      const rowLimit = Math.min(runtime.blockRows, runtime.rows - rowOffset);
      for (let colOffset = startColBlock; colOffset <= endColBlock; colOffset += runtime.blockCols) {
        const colLimit = Math.min(runtime.blockCols, runtime.cols - colOffset);
        if (rowLimit <= 0 || colLimit <= 0) {
          continue;
        }

        const blockKey = buildMatrixBlockKey(
          runtime.selectionKey,
          rowOffset,
          colOffset,
          rowLimit,
          colLimit
        );

        if (MATRIX_BLOCK_CACHE.get(blockKey)) {
          continue;
        }

        const params = {
          ...paramsBase,
          row_offset: rowOffset,
          row_limit: rowLimit,
          col_offset: colOffset,
          col_limit: colLimit,
        };
        const cancelKey = `matrix-export:${runtime.selectionKey}:${rowOffset}:${colOffset}:${rowLimit}:${colLimit}`;
        requests.push(
          getFileData(runtime.fileKey, runtime.path, params, {
            cancelPrevious: false,
            cancelKey,
          }).then((payload) => {
            MATRIX_BLOCK_CACHE.set(blockKey, payload);
          })
        );
      }
    }

    if (requests.length > 0) {
      await Promise.all(requests);
    }
  }

  async function exportCsvDisplayed() {
    if (runtime.destroyed) {
      throw new Error("Matrix runtime is no longer active.");
    }

    const bounds = getViewportBounds();
    if (!bounds) {
      throw new Error("No matrix viewport available for export.");
    }

    setMatrixStatus(statusElement, "Preparing displayed matrix CSV...", "info");
    await ensureBlocksForRange(bounds.rowStart, bounds.rowEnd, bounds.colStart, bounds.colEnd);

    const header = ["row\\col"];
    for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
      header.push(col);
    }

    const rows = [toCsvRow(header)];
    for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) {
      const values = [row];
      for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
        const value = getMatrixCellValue(runtime, row, col);
        values.push(value === null ? "" : value);
      }
      rows.push(toCsvRow(values));
    }

    const filename = buildExportFilename({
      fileKey: runtime.fileKey,
      path: runtime.path,
      tab: "matrix",
      scope: "displayed",
      extension: "csv",
    });
    const blob = createCsvBlob(rows, true);
    triggerBlobDownload(blob, filename);
    setMatrixStatus(
      statusElement,
      `Exported displayed matrix CSV (${(bounds.rowEnd - bounds.rowStart + 1).toLocaleString()} x ${(
        bounds.colEnd - bounds.colStart + 1
      ).toLocaleString()}).`,
      "info"
    );
  }

  async function exportCsvFull() {
    if (runtime.destroyed) {
      throw new Error("Matrix runtime is no longer active.");
    }

    const query = {
      path: runtime.path,
      mode: "matrix",
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
    setMatrixStatus(statusElement, "Full matrix CSV download started.", "info");
  }

  shell.__exportApi = {
    exportCsvDisplayed,
    exportCsvFull,
  };

  const onScroll = () => {
    queueRender();
  };
  table.addEventListener("scroll", onScroll, { passive: true });

  let resizeObserver = null;
  const onWindowResize = () => {
    queueRender();
  };

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(onWindowResize);
    resizeObserver.observe(table);
  } else {
    window.addEventListener("resize", onWindowResize);
  }

  updateStatusFromRuntime();
  queueRender();

  const cleanup = () => {
    runtime.destroyed = true;
    runtime.blockQueue = [];
    runtime.queuedBlockKeys.clear();
    runtime.activeCancelKeys.forEach((cancelKey) => {
      cancelPendingRequest(cancelKey, "matrix-runtime-disposed");
    });
    runtime.activeCancelKeys.clear();
    table.removeEventListener("scroll", onScroll);
    if (resizeObserver) {
      resizeObserver.disconnect();
    } else {
      window.removeEventListener("resize", onWindowResize);
    }
    if (runtime.rafToken !== null) {
      cancelAnimationFrame(runtime.rafToken);
      runtime.rafToken = null;
    }
    if (shell.__exportApi) {
      delete shell.__exportApi;
    }
  };

  MATRIX_RUNTIME_CLEANUPS.add(cleanup);
}
  if (typeof initializeMatrixRuntime !== "undefined") {
    moduleState.initializeMatrixRuntime = initializeMatrixRuntime;
    global.initializeMatrixRuntime = initializeMatrixRuntime;
  }
  if (ns.core && typeof ns.core.registerModule === "function") {
    ns.core.registerModule("components/viewerPanel/runtime/matrixRuntime");
  }
})(typeof window !== "undefined" ? window : globalThis);
