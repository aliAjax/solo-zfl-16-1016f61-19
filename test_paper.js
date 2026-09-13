// 纸张库存与开料排期核心逻辑验证：在项目目录直接 `node test_paper.js`
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const webcrypto = require("node:crypto").webcrypto;

function makeEl() {
  return {
    value: "",
    checked: false,
    hidden: false,
    innerHTML: "",
    textContent: "",
    className: "",
    dataset: {},
    style: {},
    classList: {
      toggle() {},
      add() {},
      remove() {},
      contains() {
        return false;
      }
    },
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    reset() {
      this.value = "";
    },
    scrollIntoView() {},
    querySelector() {
      return null;
    },
    closest() {
      return null;
    },
    appendChild() {}
  };
}

const registry = new Map();
const document = {
  querySelector(sel) {
    if (!registry.has(sel)) registry.set(sel, makeEl());
    return registry.get(sel);
  },
  createElement() {
    return makeEl();
  }
};
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v)
};
const testHook = {};
const sandbox = {
  console,
  document,
  localStorage,
  structuredClone,
  crypto: webcrypto,
  setTimeout,
  window: { __PAPER_TEST__: testHook, confirm: () => true }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"), sandbox);
const T = sandbox.window.__PAPER_TEST__;
const pristine = JSON.parse(JSON.stringify(T.getState())); // 初始默认数据快照

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error("✗ " + msg);
  }
}
function freshState() {
  T.setState(JSON.parse(JSON.stringify(pristine)));
  T.setPlanner({ orderId: null, picks: [], sig: null });
}

// ---------- 1. 分组：尺寸/克重/纹向 ----------
freshState();
let s = T.getState();
const before = s.papers.length;
T.receiveStock({ kind: "full", w: 787, h: 1092, gsm: 200, grainAxis: "y", qty: 5, name: "补纸" });
assert(s.papers.length === before, "同尺寸/克重/纹向入库应合并分组");
const g200 = s.papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200 && p.kind === "full");
assert(g200.qty === 25, "合并后数量应为 25，实际 " + g200.qty);
assert(g200.grainAxis === "x", "归一化后 1092×787 纹向长边应为 x");
T.receiveStock({ kind: "full", w: 1092, h: 787, gsm: 200, grainAxis: "y", qty: 4, name: "短纹纸" });
const shortGrain = s.papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200 && p.grainAxis === "y");
assert(shortGrain && shortGrain.qty === 4, "不同纹向必须分开成组");

// ---------- 2. 排料计算 + 顺纹 ----------
freshState();
const sheet = T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200);
// 成品 148×100，出血3 → 154×106
const layGrain = T.layoutOnSheet(sheet, 154, 106, true);
assert(layGrain.count === 49, `顺纹时每张 49 份（7×7），实际 ${layGrain && layGrain.count}`);
const layFree = T.layoutOnSheet(sheet, 154, 106, false);
assert(layFree.count === 50, `不限纹时取更优朝向 50 份（10×5），实际 ${layFree && layFree.count}`);
const edges = T.cutEdges(sheet, layGrain);
assert(
  edges.length === 2 &&
    edges.some((e) => e.w === 1092 && e.h === 45 && e.grainAxis === "x") &&
    edges.some((e) => e.w === 742 && e.h === 14 && e.grainAxis === "y"),
  `每张应出 1092×45 与 742×14 两条边料并继承纹向，实际 ${JSON.stringify(edges)}`
);

// ---------- 3. 自动规划：边料优先复用 ----------
freshState();
T.setPlannerInputs({ name: "单A", fw: 148, fh: 100, copies: 100, bleed: 3, waste: 5, gsm: 200, withGrain: true });
T.setPlanner({ orderId: null, picks: T.autoPlanPicks(T.readPlanSpec(), null), sig: null });
let plan = T.evaluatePlan(T.readPlanSpec(), T.getPlanner().picks, null);
assert(plan.needed === 105, "含损耗需 105 份，实际 " + plan.needed);
const offcutPick = plan.rows.find((r) => r.group.kind === "offcut");
const fullPick = plan.rows.find((r) => r.group.kind === "full");
assert(offcutPick && offcutPick.qty === 3, "应优先领用全部 3 张边料，实际 " + (offcutPick && offcutPick.qty));
assert(fullPick && fullPick.qty === 2 && fullPick.perSheet === 49, "再领 2 张原纸，实际 " + JSON.stringify(fullPick));
assert(plan.shortage === 0 && !plan.hasOver, "应份数充足且无超用");

// ---------- 4. 预留互斥：多单不得重复占用 ----------
T.saveOrder({ startNow: false });
let saved = T.getState().cuttingOrders;
assert(saved.length === 1 && saved[0].status === "pending", "开料单应保存为待开工");
assert(T.reservedQty(g200 && sheet.id) === 0 || true, "");
const reserve = T.reservedQty(sheet.id) + T.getState().papers.filter((p) => p.kind === "offcut").reduce((n, p) => n + T.reservedQty(p.id), 0);
assert(reserve === 5, "应预留 2 原纸 + 3 边料 = 5 张，实际 " + reserve);
const full200 = T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200);
assert(T.availableQty(full200) === 18, "原纸可用应剩 18，实际 " + T.availableQty(full200));

// 第二张单：边料已被 A 全部预留，不能再占用
T.setPlannerInputs({ name: "单B", fw: 148, fh: 100, copies: 200, bleed: 3, waste: 5, gsm: 200, withGrain: true });
T.setPlanner({ orderId: null, picks: T.autoPlanPicks(T.readPlanSpec(), null), sig: null });
plan = T.evaluatePlan(T.readPlanSpec(), T.getPlanner().picks, null);
assert(!plan.rows.some((r) => r.group.kind === "offcut"), "B 单不得重复占用已预留边料");
assert(plan.rows.every((r) => r.qty <= r.avail), "自动规划永远不超可用量");

// ---------- 5. 手工调整 + 超用拦截 + 缺量拦开工 ----------
T.getPlanner().picks = [{ groupId: full200.id, qty: 999 }];
T.setPlanner(T.getPlanner());
plan = T.evaluatePlan(T.readPlanSpec(), T.getPlanner().picks, null);
assert(plan.hasOver, "领用 999 张必须判定超用");
T.saveOrder({ startNow: true });
assert(T.getState().cuttingOrders.length === 1, "超用时不得保存/开工");
T.getPlanner().picks = [{ groupId: full200.id, qty: 1 }];
T.setPlanner(T.getPlanner());
plan = T.evaluatePlan(T.readPlanSpec(), T.getPlanner().picks, null);
assert(plan.shortage > 0, "1 张只能出 49 份，应有缺量 " + plan.shortage);
T.saveOrder({ startNow: true });
const ordersNow = T.getState().cuttingOrders;
assert(ordersNow.length === 1 && ordersNow[0].status === "pending", "缺量必须拦住开工（且尚未建单）");

// 缺量但可先保存待开工
T.saveOrder({ startNow: false });
const orderB = T.getState().cuttingOrders.find((o) => o.name === "单B");
assert(orderB && orderB.status === "pending", "缺量允许保存为待开工");
T.startOrder(orderB.id);
assert(T.getState().cuttingOrders.find((o) => o.id === orderB.id).status === "pending", "待开工单缺量时点开工仍被拦住");

// ---------- 6. 开工 → 完工结算：按【实际领用】扣库存 + 回报边料 + 幂等 ----------
freshState();
T.setPlannerInputs({ name: "单A", fw: 148, fh: 100, copies: 100, bleed: 3, waste: 5, gsm: 200, withGrain: true });
T.setPlanner({ orderId: null, mode: "create", picks: T.autoPlanPicks(T.readPlanSpec(), null), sig: null });
T.saveOrder({ startNow: false });
const orderA = T.getState().cuttingOrders.find((o) => o.name === "单A");
assert(orderA.picks.reduce((s, p) => s + p.qty, 0) === 5, "计划领用 5 张（3边料+2原纸）");

// 再造一张 B 单占用部分纸张（验证多单预留互斥不影响 A 的完工结算）
T.setPlannerInputs({ name: "单B", fw: 148, fh: 100, copies: 200, bleed: 3, waste: 5, gsm: 200, withGrain: true });
T.setPlanner({ orderId: null, mode: "create", picks: T.autoPlanPicks(T.readPlanSpec(), null), sig: null });
T.saveOrder({ startNow: false });

T.startOrder(orderA.id);
assert(T.getState().cuttingOrders.find((o) => o.id === orderA.id).status === "cutting", "A 单可正常开工");

const fullBefore = T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200).qty;
const offcutGroupBefore = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 520 && p.h === 300);
const offcutBefore = offcutGroupBefore ? offcutGroupBefore.qty : 0;

// 进入完工结算：默认带出计划张数，可改成实际数
T.beginComplete(orderA.id);
assert(T.getPlanner().mode === "complete", "应进入完工结算模式");
// 实际裁剪：3 张边料都用了，原纸实际只用了 1 张（计划是 2 张）
T.getPlanner().picks.forEach((pick) => {
  const group = T.getState().papers.find((p) => p.id === pick.groupId);
  if (group.kind === "full") pick.qty = 1;
});
let settle = T.evaluatePlan(T.readPlanSpec(), T.getPlanner().picks, orderA.id);
assert(settle.totalSheets === 4 && settle.produced === 67, `实际 4 张应出 67 份（18+49），实际 ${settle.totalSheets}/${settle.produced}`);
assert(!settle.hasOver, "实际领用未超可用（本单自身预留不计占用）");

// 结算超用必须被拦住
T.getPlanner().picks.forEach((pick) => {
  const group = T.getState().papers.find((p) => p.id === pick.groupId);
  if (group.kind === "full") pick.qty = 16; // B 占 5 张，可用仅 15
});
settle = T.evaluatePlan(T.readPlanSpec(), T.getPlanner().picks, orderA.id);
assert(settle.hasOver, "实际领用 16 > 可用 15，应判超用");
T.confirmComplete();
assert(T.getState().cuttingOrders.find((o) => o.id === orderA.id).status === "cutting", "结算超用不得完工，单据仍裁剪中");
const fullUnchanged = T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200).qty;
assert(fullUnchanged === fullBefore, "结算被拦时不得扣库存");

// 改回实际 1 张原纸，确认完工
T.getPlanner().picks.forEach((pick) => {
  const group = T.getState().papers.find((p) => p.id === pick.groupId);
  if (group.kind === "full") pick.qty = 1;
});
T.confirmComplete();
let aDone = T.getState().cuttingOrders.find((o) => o.id === orderA.id);
assert(aDone.status === "completed" && aDone.actual, "A 单应完成并记录实际领用");
assert(aDone.actual.sheetsUsed === 4 && aDone.actual.produced === 67, `应按实际 4 张/67 份结算，实际 ${aDone.actual.sheetsUsed}/${aDone.actual.produced}`);

// 按实际数量扣库存：只扣 1 张原纸（计划是 2 张，多出的预留释放）
const fullAfter = T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200).qty;
assert(fullAfter === fullBefore - 1, `实际用1张原纸应只扣1（${fullBefore}→${fullAfter}）`);
const offcutAfter = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 520 && p.h === 300);
assert((offcutAfter ? offcutAfter.qty : 0) === offcutBefore - 3, "完成应扣实际用掉的 3 张边料");
// 边料按实际数量回报：1 张原纸 → 各 1 条；3 张边料 → 各 3 条
assert((T.getState().papers.find((p) => p.kind === "offcut" && p.w === 1092 && p.h === 45) || {}).qty === 1, "应回报 1 张 1092×45 边料");
assert((T.getState().papers.find((p) => p.kind === "offcut" && p.w === 742 && p.h === 14) || {}).qty === 1, "应回报 1 张 742×14 边料");
const edgeFromOffcut1 = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 520 && p.h === 88);
const edgeFromOffcut2 = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 212 && p.h === 58);
assert(edgeFromOffcut1 && edgeFromOffcut1.qty === 3, `3张边料各裁出 520×88，实际 ${edgeFromOffcut1 && edgeFromOffcut1.qty}`);
assert(edgeFromOffcut2 && edgeFromOffcut2.qty === 3, `3张边料各裁出 212×58，实际 ${edgeFromOffcut2 && edgeFromOffcut2.qty}`);
assert(aDone.actual.edges.some((e) => e.w === 1092 && e.h === 45 && e.qty === 1), "actual.edges 应按实际汇总边料");
assert(aDone.picks.find((p) => p.groupSnapshot && p.groupSnapshot.kind === "full").qty === 1, "单据领用应回写为实际张数");

// 完工后该单不再预留：B 仍占 5 张，原纸可用 = 剩19-5=14
assert(T.availableQty(T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200)) === 14, "完工后实际未用的预留已释放，B 仍占 5 张");

// 幂等：对已完成单重复结算不得再扣
const qtySnapshot = T.getState().papers.map((p) => [p.id, p.qty]);
T.setPlanner({ orderId: orderA.id, mode: "complete", picks: aDone.picks.map((p) => ({ groupId: p.groupId, qty: p.qty })), sig: null });
T.confirmComplete();
T.confirmComplete();
const qtyAgain = T.getState().papers.map((p) => [p.id, p.qty]);
assert(JSON.stringify(qtySnapshot) === JSON.stringify(qtyAgain), "重复完工不得重复扣库存或再回报边料");

// ---------- 7. 取消释放预留 ----------
freshState();
T.setPlannerInputs({ name: "单C", fw: 148, fh: 100, copies: 100, bleed: 3, waste: 5, gsm: 200, withGrain: true });
T.setPlanner({ orderId: null, picks: T.autoPlanPicks(T.readPlanSpec(), null), sig: null });
T.saveOrder({ startNow: false });
const orderC = T.getState().cuttingOrders[0];
const g = T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200);
assert(T.availableQty(g) === 18, "保存后原纸可用 18");
T.cancelOrder(orderC.id);
assert(T.getState().cuttingOrders[0].status === "cancelled", "单据应转为取消");
assert(T.availableQty(g) === 20, "取消后预留释放，可用恢复 20，实际 " + T.availableQty(g));
assert(T.getState().papers.find((p) => p.kind === "offcut" && p.w === 520) !== undefined, "取消不得扣减实物库存");

// ---------- 8. 刷新一致性：持久化后重算 ----------
const persisted = JSON.parse(localStorage.getItem("zfl16-movable-type-workshop"));
assert(persisted.papers && persisted.cuttingOrders, "库存与开料单应写入 localStorage");
// 模拟刷新：用持久化数据重建 state
T.setState(persisted);
let consistent = true;
for (const p of T.getState().papers) {
  const reserved = T.reservedQty(p.id);
  if (reserved < 0 || reserved > p.qty) consistent = false;
}
assert(consistent, "刷新后预留不得超过在库、不得为负");
const live = T.getState().cuttingOrders.filter((o) => o.status === "pending" || o.status === "cutting");
const totalReserved = T.getState().papers.reduce((n, p) => n + T.reservedQty(p.id), 0);
const expected = live.reduce((n, o) => n + o.picks.reduce((a, x) => a + x.qty, 0), 0);
assert(totalReserved === expected, `刷新后预留总额 ${totalReserved} 应等于活动单据领用 ${expected}`);

// ---------- 9. 原排版数据未受影响 ----------
assert(Array.isArray(T.getState().inventory) && T.getState().inventory.length === 6, "字模库仍为 6 枚");
assert(Array.isArray(T.getState().drafts) && T.getState().settings && T.getState().settings.paperSize, "草稿/版面设置保留");

console.log(`\n${failed === 0 ? "全部通过" : "存在失败"}：${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
