const storageKey = "zfl16-movable-type-workshop";

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 4, wear: "微磨" },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨" },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 2, wear: "新" },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 4, wear: "新" }
];

const starterPapers = [
  { id: crypto.randomUUID(), kind: "full", w: 1092, h: 787, gsm: 200, grainAxis: "x", qty: 20, name: "全开棉纸", source: null },
  { id: crypto.randomUUID(), kind: "full", w: 1194, h: 889, gsm: 250, grainAxis: "x", qty: 12, name: "大度铜版纸", source: null },
  { id: crypto.randomUUID(), kind: "full", w: 1092, h: 787, gsm: 160, grainAxis: "x", qty: 8, name: "全开宣纸", source: null },
  { id: crypto.randomUUID(), kind: "offcut", w: 520, h: 300, gsm: 200, grainAxis: "x", qty: 3, name: "边料", source: null }
];

const defaultState = {
  inventory: starterInventory,
  selectedTypeId: starterInventory[0].id,
  placements: [],
  drafts: [],
  papers: starterPapers,
  cuttingOrders: [],
  settings: {
    paperSize: "postcard",
    flowMode: "horizontal",
    gridGap: 8,
    workTitle: "晚风小笺"
  }
};

let state = loadState();

const els = {
  paperSize: document.querySelector("#paperSize"),
  flowMode: document.querySelector("#flowMode"),
  gridGap: document.querySelector("#gridGap"),
  workTitle: document.querySelector("#workTitle"),
  stage: document.querySelector("#stage"),
  typeList: document.querySelector("#typeList"),
  typeForm: document.querySelector("#typeForm"),
  charInput: document.querySelector("#charInput"),
  styleInput: document.querySelector("#styleInput"),
  sizeInput: document.querySelector("#sizeInput"),
  quantityInput: document.querySelector("#quantityInput"),
  wearInput: document.querySelector("#wearInput"),
  inventorySearch: document.querySelector("#inventorySearch"),
  styleFilter: document.querySelector("#styleFilter"),
  selectedTypeLabel: document.querySelector("#selectedTypeLabel"),
  shortageBadge: document.querySelector("#shortageBadge"),
  usageList: document.querySelector("#usageList"),
  draftList: document.querySelector("#draftList"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    const merged = {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...parsed.settings }
    };
    // 迁移：统一纸组为宽≥高、纹向随交换换算
    if (Array.isArray(merged.papers)) {
      merged.papers = merged.papers
        .map((group) => {
          const norm = normalizeSheet(group.w, group.h, group.grainAxis);
          return norm ? { ...group, w: norm.w, h: norm.h, grainAxis: norm.grainAxis } : null;
        })
        .filter(Boolean);
    }
    if (!Array.isArray(merged.cuttingOrders)) merged.cuttingOrders = [];
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getGrid() {
  const size = state.settings.paperSize;
  if (size === "bookmark") return { cols: 7, rows: 18 };
  if (size === "square") return { cols: 12, rows: 12 };
  return { cols: 16, rows: 10 };
}

function placementKey(row, col) {
  return `${row}:${col}`;
}

function getSelectedType() {
  return state.inventory.find((item) => item.id === state.selectedTypeId) || null;
}

function getUsage() {
  return state.placements.reduce((acc, placement) => {
    acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
    return acc;
  }, {});
}

function renderSettings() {
  els.paperSize.value = state.settings.paperSize;
  els.flowMode.value = state.settings.flowMode;
  els.gridGap.value = state.settings.gridGap;
  els.workTitle.value = state.settings.workTitle;
}

function renderStyleFilter() {
  const current = els.styleFilter.value || "all";
  const styles = [...new Set(state.inventory.map((item) => item.style))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  els.styleFilter.innerHTML = `<option value="all">全部风格</option>${styles
    .map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`)
    .join("")}`;
  els.styleFilter.value = styles.includes(current) ? current : "all";
}

function renderInventory() {
  const keyword = els.inventorySearch.value.trim();
  const style = els.styleFilter.value;
  const usage = getUsage();
  const items = state.inventory.filter((item) => {
    const matchesKeyword = !keyword || `${item.char}${item.style}${item.wear}`.includes(keyword);
    const matchesStyle = style === "all" || item.style === style;
    return matchesKeyword && matchesStyle;
  });

  els.inventoryCount.textContent = `${state.inventory.length}枚字模`;
  els.typeList.innerHTML = items
    .map((item) => {
      const used = usage[item.id] || 0;
      const selected = item.id === state.selectedTypeId ? "selected" : "";
      return `
        <article class="type-card ${selected}" draggable="true" data-type-id="${item.id}">
          <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
          <div class="type-meta">
            <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
            <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
          </div>
          <button class="mini-btn" title="删除字模" data-delete-type="${item.id}" type="button">×</button>
        </article>
      `;
    })
    .join("");
}

function renderStage() {
  const { cols, rows } = getGrid();
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  els.stage.className = `stage ${state.settings.paperSize}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
      cells.push(`
        <button class="cell ${type ? "used" : ""} ${vertical}" data-row="${row}" data-col="${col}" type="button" aria-label="第${row + 1}行第${col + 1}列">
          ${type ? escapeHtml(type.char) : ""}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

function renderUsage() {
  const usage = getUsage();
  const entries = state.inventory.filter((item) => usage[item.id]);
  els.placedCount.textContent = `${state.placements.length}个落字`;

  const shortages = entries.filter((item) => usage[item.id] > item.quantity);
  els.shortageBadge.textContent = shortages.length ? `${shortages.length}处超量` : "数量充足";
  els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;

  const selectedType = getSelectedType();
  els.selectedTypeLabel.textContent = selectedType ? `当前：${selectedType.char} · ${selectedType.style}` : "未选择字模";

  els.usageList.innerHTML =
    entries
      .map((item) => {
        const used = usage[item.id];
        const warn = used > item.quantity ? "warn" : "";
        return `
          <div class="usage-item ${warn}">
            <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
            <span>${used}/${item.quantity}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">还没有落字。</p>`;
}

function renderDrafts() {
  els.draftList.innerHTML =
    state.drafts
      .map(
        (draft) => `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderUsage();
  renderDrafts();
}

function placeType(row, col, typeId = state.selectedTypeId) {
  if (!typeId) return;
  const existingIndex = state.placements.findIndex((item) => item.row === row && item.col === col);
  if (existingIndex >= 0) {
    if (state.placements[existingIndex].typeId === typeId) {
      state.placements.splice(existingIndex, 1);
    } else {
      state.placements[existingIndex].typeId = typeId;
    }
  } else {
    state.placements.push({ row, col, typeId });
  }
  renderAll();
}

function addType(event) {
  event.preventDefault();
  const item = {
    id: crypto.randomUUID(),
    char: els.charInput.value.trim(),
    style: els.styleInput.value.trim(),
    size: Number(els.sizeInput.value),
    quantity: Number(els.quantityInput.value),
    wear: els.wearInput.value
  };
  if (!item.char || !item.style) return;
  state.inventory.unshift(item);
  state.selectedTypeId = item.id;
  els.typeForm.reset();
  els.sizeInput.value = 24;
  els.quantityInput.value = 3;
  renderAll();
}

function saveDraft() {
  const title = state.settings.workTitle.trim() || "未命名作品";
  state.drafts.unshift({
    id: crypto.randomUUID(),
    title,
    settings: structuredClone(state.settings),
    placements: structuredClone(state.placements),
    savedAt: new Date().toISOString()
  });
  state.drafts = state.drafts.slice(0, 8);
  renderAll();
}

function exportPreview() {
  const { cols, rows } = getGrid();
  const cell = state.settings.paperSize === "bookmark" ? 44 : 56;
  const gap = state.settings.gridGap;
  const margin = 48;
  const width = cols * cell + (cols - 1) * gap + margin * 2;
  const height = rows * cell + (rows - 1) * gap + margin * 2 + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2f2921";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.fillStyle = "#22201c";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(state.settings.workTitle || "未命名作品", margin, 50);
  ctx.font = "bold 30px serif";
  state.placements.forEach((placement) => {
    const type = state.inventory.find((item) => item.id === placement.typeId);
    if (!type) return;
    const x = margin + placement.col * (cell + gap);
    const y = margin + 45 + placement.row * (cell + gap);
    ctx.fillStyle = "#2f2921";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#fff5df";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.min(type.size + 8, 42)}px serif`;
    ctx.fillText(type.char, x + cell / 2, y + cell / 2);
  });
  const link = document.createElement("a");
  link.download = `${state.settings.workTitle || "movable-type"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.paperSize.addEventListener("change", () => {
  state.settings.paperSize = els.paperSize.value;
  const { cols, rows } = getGrid();
  state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
  renderAll();
});

els.flowMode.addEventListener("change", () => {
  state.settings.flowMode = els.flowMode.value;
  renderAll();
});

els.gridGap.addEventListener("input", () => {
  state.settings.gridGap = Number(els.gridGap.value);
  renderAll();
});

els.workTitle.addEventListener("input", () => {
  state.settings.workTitle = els.workTitle.value;
  saveState();
});

els.typeForm.addEventListener("submit", addType);
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  state.placements = [];
  renderAll();
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    renderAll();
    return;
  }
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  state.selectedTypeId = card.dataset.typeId;
  renderAll();
});

els.typeList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.typeId);
});

els.stage.addEventListener("dragover", (event) => {
  if (event.target.closest(".cell")) event.preventDefault();
});

els.stage.addEventListener("drop", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  placeType(Number(cell.dataset.row), Number(cell.dataset.col), event.dataTransfer.getData("text/plain"));
});

els.stage.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  placeType(Number(cell.dataset.row), Number(cell.dataset.col));
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    state.placements = structuredClone(draft.placements);
    renderAll();
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

renderAll();

/* ============================================================
   纸张库存与开料排期
   ============================================================ */

const EDGE_MIN_MM = 10; // 小于该尺寸的边料直接作废，不入库
const ORDER_STATUSES = ["pending", "cutting", "completed", "cancelled"];
const STATUS_LABEL = { pending: "待开工", cutting: "裁剪中", completed: "完成", cancelled: "取消" };

const paperEls = {
  tabTypeset: document.querySelector("#tabTypeset"),
  tabPaper: document.querySelector("#tabPaper"),
  typesetView: document.querySelector("#typesetView"),
  paperView: document.querySelector("#paperView"),
  stockCount: document.querySelector("#stockCount"),
  stockForm: document.querySelector("#stockForm"),
  stockWidth: document.querySelector("#stockWidth"),
  stockHeight: document.querySelector("#stockHeight"),
  stockGsm: document.querySelector("#stockGsm"),
  stockGrain: document.querySelector("#stockGrain"),
  stockQty: document.querySelector("#stockQty"),
  stockName: document.querySelector("#stockName"),
  stockSearch: document.querySelector("#stockSearch"),
  stockList: document.querySelector("#stockList"),
  plannerTitle: document.querySelector("#plannerTitle"),
  planForm: document.querySelector("#planForm"),
  planName: document.querySelector("#planName"),
  planFW: document.querySelector("#planFW"),
  planFH: document.querySelector("#planFH"),
  planCopies: document.querySelector("#planCopies"),
  planBleed: document.querySelector("#planBleed"),
  planWaste: document.querySelector("#planWaste"),
  planGsm: document.querySelector("#planGsm"),
  planWithGrain: document.querySelector("#planWithGrain"),
  planSummary: document.querySelector("#planSummary"),
  planPicks: document.querySelector("#planPicks"),
  planAddGroup: document.querySelector("#planAddGroup"),
  planAddPickBtn: document.querySelector("#planAddPickBtn"),
  planMessage: document.querySelector("#planMessage"),
  planSaveBtn: document.querySelector("#planSaveBtn"),
  planStartBtn: document.querySelector("#planStartBtn"),
  planCancelEditBtn: document.querySelector("#planCancelEditBtn"),
  board: {
    pending: document.querySelector("#colPending"),
    cutting: document.querySelector("#colCutting"),
    completed: document.querySelector("#colCompleted"),
    cancelled: document.querySelector("#colCancelled")
  },
  boardCount: {
    pending: document.querySelector("#countPending"),
    cutting: document.querySelector("#countCutting"),
    completed: document.querySelector("#countCompleted"),
    cancelled: document.querySelector("#countCancelled")
  }
};

// 新建开料单时的工作草稿（还没保存进 state.cuttingOrders）
let planner = { orderId: null, picks: [], sig: null };

function clampInt(value, min, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

function grainLabel(axis) {
  return axis === "x" ? "纹向长边" : "纹向短边";
}

// 统一存成 w >= h；返回 { w, h, grainAxis }
function normalizeSheet(rawW, rawH, grainAxis) {
  let w = Math.round(Number(rawW));
  let h = Math.round(Number(rawH));
  let axis = grainAxis;
  if (w <= 0 || h <= 0) return null;
  if (h > w) {
    [w, h] = [h, w];
    axis = axis === "x" ? "y" : "x";
  }
  if (axis !== "x" && axis !== "y") axis = "y";
  return { w, h, grainAxis: axis };
}

function groupKey(kind, w, h, gsm, grainAxis) {
  return `${kind}|${w}x${h}|${gsm}|${grainAxis}`;
}

function findGroup(kind, w, h, gsm, grainAxis) {
  const norm = normalizeSheet(w, h, grainAxis);
  const key = groupKey(kind, norm.w, norm.h, gsm, norm.grainAxis);
  return state.papers.find((group) => groupKey(group.kind, group.w, group.h, group.gsm, group.grainAxis) === key) || null;
}

// 入库：同尺寸/克重/纹向自动合并；边料独立成组
function receiveStock({ kind, w, h, gsm, grainAxis, qty, name, source }) {
  const norm = normalizeSheet(w, h, grainAxis);
  if (!norm || qty <= 0) return null;
  const existing = findGroup(kind, norm.w, norm.h, gsm, norm.grainAxis);
  if (existing) {
    existing.qty += qty;
    if (!existing.name && name) existing.name = name;
    return existing;
  }
  const group = {
    id: crypto.randomUUID(),
    kind,
    w: norm.w,
    h: norm.h,
    gsm,
    grainAxis: norm.grainAxis,
    qty,
    name: name || (kind === "offcut" ? "边料" : ""),
    source: source || null
  };
  state.papers.push(group);
  return group;
}

// 预留张数：待开工 + 裁剪中 对某纸组的领用
function reservedQty(groupId) {
  return state.cuttingOrders
    .filter((order) => order.status === "pending" || order.status === "cutting")
    .reduce((sum, order) => sum + order.picks.filter((pick) => pick.groupId === groupId).reduce((s, pick) => s + pick.qty, 0), 0);
}

function availableQty(group) {
  return Math.max(0, group.qty - reservedQty(group.id));
}

/* ---------- 排料计算 ---------- */

// 在单张纸/边料上排料，考虑顺纹；返回最优朝向
function layoutOnSheet(sheet, pieceW, pieceH, withGrain) {
  const candidates = [];
  for (const [pw, ph, grainParallelLong] of [
    [pieceW, pieceH, null],
    [pieceH, pieceW, null]
  ]) {
    const cols = Math.floor(sheet.w / pw);
    const rows = Math.floor(sheet.h / ph);
    const count = cols * rows;
    if (count <= 0) continue;
    // 成品长边 = max(pieceW, pieceH)；该朝向下成品长边平行于 x 还是 y
    const pieceLongAxis = pieceW >= pieceH ? "x" : "y";
    // 若旋转了，长边轴对调
    const longAxis = pw >= ph ? pieceLongAxis : pieceLongAxis === "x" ? "y" : "x";
    const grainParallel = sheet.grainAxis === longAxis;
    if (withGrain && !grainParallel) continue;
    candidates.push({ pw, ph, cols, rows, count, grainParallel });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.count - a.count || a.pw * a.ph - b.pw * a.ph);
  return candidates[0];
}

// 剩余边料：右条 + 下条（宽度达到 EDGE_MIN_MM 才保留）
function cutEdges(sheet, layout) {
  const edges = [];
  const usedW = layout.cols * layout.pw;
  const usedH = layout.rows * layout.ph;
  const strips = [
    { w: sheet.w - usedW, h: usedH }, // 右条
    { w: sheet.w, h: sheet.h - usedH } // 下条
  ];
  for (const strip of strips) {
    if (strip.w < EDGE_MIN_MM || strip.h < EDGE_MIN_MM) continue;
    // 边料继承原纸纹向，归一化时随宽高交换自动换算轴向
    const norm = normalizeSheet(strip.w, strip.h, sheet.grainAxis);
    if (norm) edges.push(norm);
  }
  return edges;
}

function readPlanSpec() {
  const bleed = Number(paperEls.planBleed.value) || 0;
  const waste = Number(paperEls.planWaste.value) || 0;
  return {
    name: paperEls.planName.value.trim(),
    fw: clampInt(paperEls.planFW.value, 1, 0),
    fh: clampInt(paperEls.planFH.value, 1, 0),
    copies: clampInt(paperEls.planCopies.value, 1, 1),
    bleed: Math.max(0, bleed),
    waste: Math.min(100, Math.max(0, waste)),
    gsm: clampInt(paperEls.planGsm.value, 1, 0),
    withGrain: paperEls.planWithGrain.checked,
    pieceW: clampInt(paperEls.planFW.value, 1, 0) + Math.max(0, bleed) * 2,
    pieceH: clampInt(paperEls.planFH.value, 1, 0) + Math.max(0, bleed) * 2
  };
}

// 自动规划：边料优先（面积小且能整张满足），再原纸
function autoPlanPicks(spec, ignoreOrderId) {
  if (!spec.gsm || spec.pieceW <= 0 || spec.pieceH <= 0) return [];
  const needed = Math.ceil(spec.copies * (1 + spec.waste / 100));

  const usable = state.papers
    .filter((group) => group.gsm === spec.gsm)
    .map((group) => {
      const layout = layoutOnSheet(group, spec.pieceW, spec.pieceH, spec.withGrain);
      const reservedByOthers = state.cuttingOrders
        .filter((order) => order.status === "pending" || order.status === "cutting")
        .filter((order) => order.id !== ignoreOrderId)
        .reduce((sum, order) => sum + order.picks.filter((pick) => pick.groupId === group.id).reduce((s, pick) => s + pick.qty, 0), 0);
      return { group, layout, avail: Math.max(0, group.qty - reservedByOthers) };
    })
    .filter((item) => item.layout && item.avail > 0);

  const offcuts = usable
    .filter((item) => item.group.kind === "offcut")
    .sort((a, b) => a.group.w * a.group.h - b.group.w * b.group.h || b.layout.count - a.layout.count);
  const fulls = usable
    .filter((item) => item.group.kind === "full")
    .sort((a, b) => b.layout.count - a.layout.count || a.group.w * a.group.h - b.group.w * b.group.h);

  const picks = [];
  let remaining = needed;
  for (const item of [...offcuts, ...fulls]) {
    if (remaining <= 0) break;
    const take = Math.min(item.avail, Math.ceil(remaining / item.layout.count));
    if (take <= 0) continue;
    picks.push({ groupId: item.group.id, qty: take });
    remaining -= take * item.layout.count;
  }
  return picks;
}

// 根据当前手工领用单复核：可出份数 / 缺口 / 是否超用 / 边料
function evaluatePlan(spec, picks, ignoreOrderId) {
  const needed = Math.ceil(spec.copies * (1 + spec.waste / 100));
  const rows = picks.map((pick) => {
    const group = state.papers.find((item) => item.id === pick.groupId);
    const reservedByOthers = group
      ? state.cuttingOrders
          .filter((order) => order.status === "pending" || order.status === "cutting")
          .filter((order) => order.id !== ignoreOrderId)
          .reduce((sum, order) => sum + order.picks.filter((p) => p.groupId === group.id).reduce((s, p) => s + p.qty, 0), 0)
      : 0;
    const avail = group ? Math.max(0, group.qty - reservedByOthers) : 0;
    const over = pick.qty > avail;
    const layout = group ? layoutOnSheet(group, spec.pieceW, spec.pieceH, spec.withGrain) : null;
    const perSheet = layout ? layout.count : 0;
    const edges = group && layout ? cutEdges(group, layout) : [];
    return { group, qty: pick.qty, avail, over, perSheet, layout, edges, produced: perSheet * pick.qty };
  });
  const produced = rows.reduce((sum, row) => sum + row.produced, 0);
  const totalSheets = rows.reduce((sum, row) => sum + row.qty, 0);
  const hasOver = rows.some((row) => row.over);
  const shortage = Math.max(0, needed - produced);
  return { needed, produced, shortage, totalSheets, hasOver, rows };
}

/* ---------- 单据操作 ---------- */

function serializeGroup(group) {
  return { id: group.id, kind: group.kind, w: group.w, h: group.h, gsm: group.gsm, grainAxis: group.grainAxis, name: group.name };
}

function saveOrder({ startNow }) {
  const spec = readPlanSpec();
  if (!spec.fw || !spec.fh || !spec.gsm) {
    showPlanMessage("请先填写有效的成品尺寸并选择克重。", "warn");
    return;
  }
  const result = evaluatePlan(spec, planner.picks, planner.orderId);
  if (result.hasOver) {
    showPlanMessage("领用张数超过可用库存（含其他单据预留），不得超用，请先调整。", "warn");
    return;
  }
  if (startNow && result.shortage > 0) {
    showPlanMessage(`缺量 ${result.shortage} 份（需 ${result.needed}，当前可出 ${result.produced}），已拦住开工。可先保存为待开工。`, "warn");
    return;
  }

  const payload = {
    name: spec.name || `开料单 ${spec.fw}×${spec.fh}`,
    fw: spec.fw,
    fh: spec.fh,
    copies: spec.copies,
    bleed: spec.bleed,
    waste: spec.waste,
    gsm: spec.gsm,
    withGrain: spec.withGrain,
    needed: result.needed,
    picks: result.rows.map((row) => ({
      groupId: row.group.id,
      qty: row.qty,
      perSheet: row.perSheet,
      groupSnapshot: serializeGroup(row.group)
    }))
  };

  if (planner.orderId) {
    const order = state.cuttingOrders.find((item) => item.id === planner.orderId);
    if (!order || order.status !== "pending") {
      showPlanMessage("只有待开工单据可以修改。", "warn");
      return;
    }
    Object.assign(order, payload);
    order.updatedAt = new Date().toISOString();
    if (startNow) order.status = "cutting";
  } else {
    state.cuttingOrders.unshift({
      id: crypto.randomUUID(),
      ...payload,
      status: startNow ? "cutting" : "pending",
      createdAt: new Date().toISOString(),
      picks: payload.picks,
      completedAt: null,
      actual: null
    });
  }
  saveState();
  resetPlanner();
  renderPaperAll();
  showPlanMessage(
    startNow ? "已开工：纸张已转入裁剪中。" : "已保存并预留纸张，其他开料单不能重复占用。",
    "ok"
  );
}

function startOrder(orderId) {
  const order = state.cuttingOrders.find((item) => item.id === orderId);
  if (!order || order.status !== "pending") return;
  const result = evaluateOrderNow(order);
  if (result.shortage > 0 || result.hasOver) {
    showPlanMessage(`缺量 ${result.shortage} 份或存在超用，拦住开工。可在编辑中补加领用纸组。`, "warn");
    return;
  }
  order.status = "cutting";
  saveState();
  renderPaperAll();
}

function evaluateOrderNow(order) {
  const spec = {
    fw: order.fw,
    fh: order.fh,
    copies: order.copies,
    bleed: order.bleed,
    waste: order.waste,
    gsm: order.gsm,
    withGrain: order.withGrain,
    pieceW: order.fw + order.bleed * 2,
    pieceH: order.fh + order.bleed * 2
  };
  return evaluatePlan(spec, order.picks, order.id);
}

// 完成：按实际领用扣库存 + 回报边料；幂等
function completeOrder(orderId) {
  const order = state.cuttingOrders.find((item) => item.id === orderId);
  if (!order) return;
  if (order.status === "completed") return; // 同一单重复完成不重复扣减
  if (order.status !== "cutting") return;

  const result = evaluateOrderNow(order);
  // 记录实际回报的边料，按领用逐张裁剪
  const returnedEdges = [];
  for (const row of result.rows) {
    if (!row.group) continue;
    // 扣库存（预留随之消失，净效果：可用减少 qty）
    row.group.qty -= row.qty;
    if (row.group.qty <= 0) {
      state.papers = state.papers.filter((item) => item.id !== row.group.id);
    }
    for (let i = 0; i < row.qty; i += 1) {
      for (const edge of row.edges) {
        const received = receiveStock({
          kind: "offcut",
          w: edge.w,
          h: edge.h,
          gsm: order.gsm,
          grainAxis: edge.grainAxis,
          qty: 1,
          name: "边料",
          source: order.name
        });
        returnedEdges.push(received ? serializeGroup(received) : null);
      }
    }
  }

  order.status = "completed";
  order.completedAt = new Date().toISOString();
  order.actual = {
    sheetsUsed: result.totalSheets,
    produced: result.produced,
    needed: result.needed,
    edges: summarizeEdges(returnedEdges.filter(Boolean))
  };
  saveState();
  renderPaperAll();
}

function summarizeEdges(edges) {
  const map = new Map();
  for (const edge of edges) {
    const key = groupKey(edge.kind, edge.w, edge.h, edge.gsm, edge.grainAxis);
    const current = map.get(key);
    if (current) current.qty += 1;
    else map.set(key, { ...edge, qty: 1 });
  }
  return [...map.values()];
}

// 取消：释放全部未用预留（不扣库存）
function cancelOrder(orderId) {
  const order = state.cuttingOrders.find((item) => item.id === orderId);
  if (!order) return;
  if (order.status !== "pending" && order.status !== "cutting") return;
  if (!window.confirm(`确定取消「${order.name}」？未用预留将全部释放。`)) return;
  order.status = "cancelled";
  saveState();
  renderPaperAll();
}

function removeOrder(orderId) {
  const order = state.cuttingOrders.find((item) => item.id === orderId);
  if (!order) return;
  if (order.status !== "completed" && order.status !== "cancelled") return;
  if (!window.confirm("删除该单据记录？库存与边料不受影响。")) return;
  state.cuttingOrders = state.cuttingOrders.filter((item) => item.id !== orderId);
  saveState();
  renderPaperAll();
}

function editOrder(orderId) {
  const order = state.cuttingOrders.find((item) => item.id === orderId);
  if (!order || order.status !== "pending") return;
  planner = { orderId: order.id, picks: order.picks.map((pick) => ({ ...pick })) };
  paperEls.planName.value = order.name;
  paperEls.planFW.value = order.fw;
  paperEls.planFH.value = order.fh;
  paperEls.planCopies.value = order.copies;
  paperEls.planBleed.value = order.bleed;
  paperEls.planWaste.value = order.waste;
  ensureGsmOptions(order.gsm);
  paperEls.planGsm.value = String(order.gsm);
  paperEls.planWithGrain.checked = order.withGrain;
  paperEls.plannerTitle.textContent = `编辑开料单：${order.name}`;
  paperEls.planCancelEditBtn.hidden = false;
  planner.sig = planSpecSig(readPlanSpec()); // 载入既有领用，不触发重排
  renderPlanner();
  paperEls.plannerTitle.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- 渲染 ---------- */

function resetPlanner() {
  planner = { orderId: null, picks: [], sig: null };
  paperEls.planForm.reset();
  paperEls.planFW.value = 148;
  paperEls.planFH.value = 100;
  paperEls.planCopies.value = 100;
  paperEls.planBleed.value = 3;
  paperEls.planWaste.value = 5;
  paperEls.planWithGrain.checked = true;
  paperEls.plannerTitle.textContent = "新建开料单";
  paperEls.planCancelEditBtn.hidden = true;
  hidePlanMessage();
  syncGsmOptions();
  renderPlanner();
}

function ensureGsmOptions(preferredGsm) {
  const gsms = [...new Set(state.papers.map((group) => group.gsm))].sort((a, b) => a - b);
  if (preferredGsm && !gsms.includes(preferredGsm)) gsms.push(preferredGsm);
  gsms.sort((a, b) => a - b);
  const current = Number(paperEls.planGsm.value) || gsms[0] || 0;
  paperEls.planGsm.innerHTML = gsms.length
    ? gsms.map((gsm) => `<option value="${gsm}">${gsm} g/㎡</option>`).join("")
    : `<option value="0">请先入库纸张</option>`;
  paperEls.planGsm.value = gsms.includes(current) ? String(current) : gsms[0] ? String(gsms[0]) : "0";
}

function syncGsmOptions() {
  ensureGsmOptions(Number(paperEls.planGsm.value));
}

function showPlanMessage(text, kind) {
  paperEls.planMessage.textContent = text;
  paperEls.planMessage.className = `plan-message show ${kind}`;
}

function hidePlanMessage() {
  paperEls.planMessage.textContent = "";
  paperEls.planMessage.className = "plan-message";
}

function renderStock() {
  const keyword = paperEls.stockSearch.value.trim();
  const groups = state.papers
    .filter((group) => {
      if (!keyword) return true;
      return `${group.w}×${group.h} ${group.gsm} ${group.name || ""} ${grainLabel(group.grainAxis)}`.includes(keyword);
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "offcut" ? -1 : 1; // 边料优先展示
      return b.gsm - a.gsm;
    });

  const offcutKinds = state.papers.filter((group) => group.kind === "offcut").length;
  paperEls.stockCount.textContent = `${state.papers.length}组（边料${offcutKinds}组）`;

  paperEls.stockList.innerHTML =
    groups
      .map((group) => {
        const reserved = reservedQty(group.id);
        const avail = availableQty(group);
        return `
          <article class="stock-group ${group.kind}">
            <div class="stock-group-head">
              <strong>${group.w} × ${group.h} mm</strong>
              <span class="stock-tag ${group.kind}">${group.kind === "offcut" ? "边料" : "原纸"}</span>
            </div>
            <div class="stock-meta">
              <span>${group.gsm} g/㎡</span>
              <span>${grainLabel(group.grainAxis)}</span>
              ${group.name ? `<span>${escapeHtml(group.name)}</span>` : ""}
            </div>
            <div class="stock-nums">
              <span>在库 <b>${group.qty}</b></span>
              <span class="reserved">预留 <b>${reserved}</b></span>
              <span class="avail">可用 <b>${avail}</b></span>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty-hint">还没有纸张库存，先在上方入库。</p>`;
}

function planSpecSig(spec) {
  return [spec.fw, spec.fh, spec.copies, spec.bleed, spec.waste, spec.gsm, spec.withGrain, planner.orderId].join("|");
}

// 规格变化时重新自动排料；手工清空/调整不被覆盖
function ensureAutoPicks(spec) {
  const sig = planSpecSig(spec);
  if (planner.sig === null) {
    planner.picks = autoPlanPicks(spec, planner.orderId);
    planner.sig = sig;
    return;
  }
  if (planner.sig !== sig) {
    planner.picks = autoPlanPicks(spec, planner.orderId);
    planner.sig = sig;
  }
}

function renderPlanner() {
  const spec = readPlanSpec();
  syncGroupAddOptions(spec);

  ensureAutoPicks(spec);
  const result = evaluatePlan(spec, planner.picks, planner.orderId);

  paperEls.planSummary.innerHTML = `
    <span>含出血尺寸 <b>${spec.pieceW}×${spec.pieceH}mm</b></span>
    <span>需出份数(含损耗) <b>${result.needed}</b></span>
    <span>领用 <b>${result.totalSheets}</b> 张</span>
    <span>可出 <b>${result.produced}</b> 份</span>
    <span>缺口 <b style="color:${result.shortage ? "var(--red)" : "var(--green)"}">${result.shortage}</b> 份</span>
  `;

  paperEls.planPicks.innerHTML = result.rows.length
    ? result.rows
        .map((row, index) => {
          const group = row.group;
          const edgeText = row.edges.length
            ? row.edges.map((edge) => `${edge.w}×${edge.h}`).join("、")
            : "无边料";
          return `
            <div class="pick-row ${row.over ? "over" : ""}">
              <div class="pick-name">
                ${group ? `${group.w}×${group.h} · ${group.gsm}g` : "纸组已不存在"}
                <span class="sub">${group ? (group.kind === "offcut" ? "边料 · " : "原纸 · ") + grainLabel(group.grainAxis) : ""}</span>
              </div>
              <span title="单张可出">每张 ${row.perSheet} 份</span>
              <span title="该组可出">共 ${row.produced} 份</span>
              <span title="裁剪后边料">边料 ${escapeHtml(edgeText)}</span>
              <span class="${row.over ? "over-note" : ""}">可用 ${row.avail}</span>
              <input type="number" min="0" max="${Math.max(0, row.avail)}" value="${row.qty}" data-pick-qty="${index}" aria-label="领用张数" />
              <button type="button" class="mini-btn" data-pick-remove="${index}" title="移除">×</button>
            </div>
          `;
        })
        .join("")
    : `<p class="empty-hint">没有匹配克重${spec.withGrain ? "且满足顺纹" : ""}的可用纸张，或纸张小于成品尺寸。</p>`;

  paperEls.planStartBtn.disabled = result.hasOver || result.shortage > 0;
  paperEls.planSaveBtn.disabled = result.hasOver;
  if (result.hasOver) {
    showPlanMessage("存在超用：领用张数不得超过可用库存，请调小或移除。", "warn");
  } else if (result.shortage > 0) {
    showPlanMessage(`缺量 ${result.shortage} 份：可以保存为待开工，但开工被拦住。`, "warn");
  } else if (result.rows.length) {
    showPlanMessage("份数充足，可保存或直接开工。", "ok");
  } else {
    hidePlanMessage();
  }
}

function syncGroupAddOptions(spec) {
  const pickedIds = new Set(planner.picks.map((pick) => pick.groupId));
  const candidates = state.papers
    .filter((group) => group.gsm === spec.gsm && !pickedIds.has(group.id) && availableQty(group) > 0)
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "offcut" ? -1 : 1));
  paperEls.planAddGroup.innerHTML = candidates.length
    ? candidates
        .map((group) => {
          const layout = layoutOnSheet(group, spec.pieceW, spec.pieceH, spec.withGrain);
          const fit = layout ? `每张${layout.count}份` : "放不下";
          return `<option value="${group.id}">${group.kind === "offcut" ? "边料" : "原纸"} ${group.w}×${group.h} ${group.gsm}g（可用${availableQty(group)}，${fit}）</option>`;
        })
        .join("")
    : `<option value="">没有可加的同克重纸组</option>`;
}

function renderBoard() {
  const orders = { pending: [], cutting: [], completed: [], cancelled: [] };
  for (const order of state.cuttingOrders) {
    if (orders[order.status]) orders[order.status].push(order);
  }
  for (const status of ORDER_STATUSES) {
    paperEls.boardCount[status].textContent = orders[status].length;
    paperEls.board[status].innerHTML = orders[status].map((order) => renderOrderCard(order, status)).join("") || `<p class="empty-hint">无</p>`;
  }
}

function renderOrderCard(order, status) {
  const result = status === "pending" || status === "cutting" ? evaluateOrderNow(order) : null;
  const short = result && result.shortage > 0;
  const pickLines = order.picks
    .map((pick) => {
      const snap = pick.groupSnapshot;
      const group = state.papers.find((item) => item.id === pick.groupId);
      const meta = group || snap;
      const label = meta ? `${meta.w}×${meta.h} ${meta.gsm}g${meta.kind === "offcut" ? "（边料）" : ""}` : "纸组已删除";
      return `<div class="order-pick-line"><span>${escapeHtml(label)}</span><strong>${pick.qty}张 · 每张${pick.perSheet}份</strong></div>`;
    })
    .join("");
  const edgeLines = order.actual
    ? order.actual.edges.map((edge) => `<div class="order-pick-line"><span>回边料 ${edge.w}×${edge.h} ${edge.gsm}g</span><strong class="offcut-note">+${edge.qty}</strong></div>`).join("")
    : "";

  let actions = "";
  if (status === "pending") {
    actions = `
      <div class="order-actions">
        <button type="button" data-order-start="${order.id}" ${short ? "disabled" : ""}>开工</button>
        <button type="button" data-order-edit="${order.id}">编辑</button>
        <button type="button" data-order-cancel="${order.id}">取消</button>
      </div>`;
  } else if (status === "cutting") {
    actions = `
      <div class="order-actions">
        <button type="button" class="primary" data-order-complete="${order.id}">完成</button>
        <button type="button" data-order-cancel="${order.id}">取消</button>
      </div>`;
  } else {
    actions = `<div class="order-actions"><button type="button" data-order-remove="${order.id}">删除记录</button></div>`;
  }

  return `
    <article class="order-card ${status} ${short ? "short" : ""}">
      <div class="order-title">${escapeHtml(order.name)}</div>
      <div class="order-line">
        <span>成品 ${order.fw}×${order.fh}mm</span>
        <span>${order.copies}份</span>
        <span>出血${order.bleed}</span>
        <span>损耗${order.waste}%</span>
        <span>${order.gsm}g</span>
        <span>${order.withGrain ? "顺纹" : "不限纹"}</span>
      </div>
      ${
        short
          ? `<div class="badge warn">缺量 ${result.shortage} 份 · 拦住开工</div>`
          : status === "pending"
            ? `<div class="badge info">已预留 ${order.picks.reduce((s, p) => s + p.qty, 0)} 张</div>`
            : ""
      }
      ${
        status === "completed" && order.actual
          ? `<div class="order-line"><span>实用 ${order.actual.sheetsUsed} 张 · 实出 ${order.actual.produced} 份</span></div>`
          : ""
      }
      <div class="order-picks">${pickLines}${edgeLines}</div>
      ${actions}
    </article>
  `;
}

function renderPaperAll() {
  renderStock();
  renderPlanner();
  renderBoard();
}

/* ---------- 交互 ---------- */

function switchView(view) {
  const isPaper = view === "paper";
  paperEls.paperView.hidden = !isPaper;
  paperEls.typesetView.hidden = isPaper;
  paperEls.tabPaper.classList.toggle("active", isPaper);
  paperEls.tabTypeset.classList.toggle("active", !isPaper);
  if (isPaper) renderPaperAll();
}

paperEls.tabTypeset.addEventListener("click", () => switchView("typeset"));
paperEls.tabPaper.addEventListener("click", () => switchView("paper"));

paperEls.stockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const qty = clampInt(paperEls.stockQty.value, 1, 1);
  const gsm = clampInt(paperEls.stockGsm.value, 1, 0);
  const w = clampInt(paperEls.stockWidth.value, 1, 0);
  const h = clampInt(paperEls.stockHeight.value, 1, 0);
  if (!w || !h || !gsm) return;
  // 录入时纹向是相对原始宽高：选 long=纹向长边。先归一化得到 axis
  const axis = paperEls.stockGrain.value === "long" ? (w >= h ? "x" : "y") : w >= h ? "y" : "x";
  receiveStock({
    kind: "full",
    w,
    h,
    gsm,
    grainAxis: axis,
    qty,
    name: paperEls.stockName.value.trim()
  });
  saveState();
  paperEls.stockForm.reset();
  paperEls.stockWidth.value = 787;
  paperEls.stockHeight.value = 1092;
  paperEls.stockGsm.value = 200;
  paperEls.stockGrain.value = "long";
  paperEls.stockQty.value = 10;
  syncGsmOptions();
  renderPaperAll();
});

paperEls.stockSearch.addEventListener("input", renderStock);

// 规格变化 → 签名变化后由 renderPlanner 重新自动排料
["planFW", "planFH", "planCopies", "planBleed", "planWaste", "planGsm", "planWithGrain"].forEach((key) => {
  paperEls[key].addEventListener("change", renderPlanner);
});

paperEls.planAddPickBtn.addEventListener("click", () => {
  const groupId = paperEls.planAddGroup.value;
  if (!groupId) return;
  if (planner.picks.some((pick) => pick.groupId === groupId)) return;
  const group = state.papers.find((item) => item.id === groupId);
  const spec = readPlanSpec();
  const layout = layoutOnSheet(group, spec.pieceW, spec.pieceH, spec.withGrain);
  const result = evaluatePlan(spec, planner.picks, planner.orderId);
  const needSheets = layout ? Math.max(1, Math.ceil(result.shortage / layout.count)) : 1;
  planner.picks.push({ groupId, qty: Math.min(needSheets, availableQty(group)) });
  renderPlanner();
});

paperEls.planPicks.addEventListener("input", (event) => {
  const input = event.target.closest("[data-pick-qty]");
  if (!input) return;
  const index = Number(input.dataset.pickQty);
  const value = Math.max(0, clampInt(input.value, 0, 0));
  planner.picks[index].qty = value;
  renderPlanner();
});

paperEls.planPicks.addEventListener("click", (event) => {
  const removeBtn = event.target.closest("[data-pick-remove]");
  if (!removeBtn) return;
  const index = Number(removeBtn.dataset.pickRemove);
  planner.picks.splice(index, 1);
  renderPlanner();
});

paperEls.planSaveBtn.addEventListener("click", () => saveOrder({ startNow: false }));
paperEls.planStartBtn.addEventListener("click", () => saveOrder({ startNow: true }));
paperEls.planCancelEditBtn.addEventListener("click", () => {
  resetPlanner();
  renderPaperAll();
});

document.querySelector(".board").addEventListener("click", (event) => {
  const handlers = {
    orderStart: startOrder,
    orderComplete: completeOrder,
    orderCancel: cancelOrder,
    orderRemove: removeOrder,
    orderEdit: editOrder
  };
  for (const [key, handler] of Object.entries(handlers)) {
    const attr = `data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
    const button = event.target.closest(`[${attr}]`);
    if (button) {
      handler(button.dataset[key]);
      return;
    }
  }
});

ensureGsmOptions();
renderPaperAll();

// 测试钩子：仅供 Node 验证脚本读取内部逻辑，浏览器中无副作用
if (typeof window !== "undefined" && window.__PAPER_TEST__) {
  Object.assign(window.__PAPER_TEST__, {
    getState: () => state,
    setState: (next) => { state = next; },
    resetPlanner,
    autoPlanPicks,
    evaluatePlan,
    evaluateOrderNow,
    layoutOnSheet,
    cutEdges,
    normalizeSheet,
    receiveStock,
    findGroup,
    reservedQty,
    availableQty,
    saveOrder,
    startOrder,
    completeOrder,
    cancelOrder,
    setPlanner: (next) => { planner = next; },
    getPlanner: () => planner,
    readPlanSpec,
    readPlannerInputs: () => ({
      name: paperEls.planName.value, fw: paperEls.planFW.value, fh: paperEls.planFH.value,
      copies: paperEls.planCopies.value, bleed: paperEls.planBleed.value, waste: paperEls.planWaste.value,
      gsm: paperEls.planGsm.value, withGrain: paperEls.planWithGrain.checked
    }),
    setPlannerInputs: (values) => {
      const inputMap = {
        name: "planName",
        fw: "planFW",
        fh: "planFH",
        copies: "planCopies",
        bleed: "planBleed",
        waste: "planWaste",
        gsm: "planGsm"
      };
      for (const [k, v] of Object.entries(values)) {
        if (k === "withGrain") paperEls.planWithGrain.checked = v;
        else paperEls[inputMap[k]].value = v;
      }
    }
  });
}
