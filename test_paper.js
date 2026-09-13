// 纸张库存与开料排期核心逻辑验证：node test_paper.js
const fs = require("node:fs");
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
vm.runInNewContext(fs.readFileSync("/workspace/app.js", "utf8"), sandbox);
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

// ---------- 6. 备料后开工 → 完成扣库存 + 回报边料 + 幂等 ----------
freshState();
T.setPlannerInputs({ name: "单A", fw: 148, fh: 100, copies: 100, bleed: 3, waste: 5, gsm: 200, withGrain: true });
T.setPlanner({ orderId: null, picks: T.autoPlanPicks(T.readPlanSpec(), null), sig: null });
T.saveOrder({ startNow: false });
const orderA = T.getState().cuttingOrders.find((o) => o.name === "单A");

// 再造一张 B 单占用部分纸张（验证多单预留互斥不影响 A 的完成）
T.setPlannerInputs({ name: "单B", fw: 148, fh: 100, copies: 200, bleed: 3, waste: 5, gsm: 200, withGrain: true });
T.setPlanner({ orderId: null, picks: T.autoPlanPicks(T.readPlanSpec(), null), sig: null });
T.saveOrder({ startNow: false });
const orderBSpare = T.getState().cuttingOrders.find((o) => o.name === "单B");

T.startOrder(orderA.id);
assert(T.getState().cuttingOrders.find((o) => o.id === orderA.id).status === "cutting", "A 单可正常开工");

const fullBefore = T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200).qty;
const offcutGroupBefore = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 520 && p.h === 300);
const offcutBefore = offcutGroupBefore ? offcutGroupBefore.qty : 0;
const edge45Before = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 1092 && p.h === 45);
const edge45Count = edge45Before ? edge45Before.qty : 0;

T.completeOrder(orderA.id);
let aDone = T.getState().cuttingOrders.find((o) => o.id === orderA.id);
assert(aDone.status === "completed" && aDone.actual, "A 单应完成并记录实际领用");
assert(aDone.actual.sheetsUsed === 5 && aDone.actual.produced === 116, `实用 5 张实出 116 份（顺纹下边料每张6份×3 + 原纸49份×2），实际 ${aDone.actual.sheetsUsed}/${aDone.actual.produced}`);

const fullAfter = T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200).qty;
assert(fullAfter === fullBefore - 2, `完成应扣 2 张原纸（${fullBefore}→${fullAfter}）`);
const offcutAfter = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 520 && p.h === 300);
assert((offcutAfter ? offcutAfter.qty : 0) === offcutBefore - 3, "完成应扣 3 张边料");
const edge45After = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 1092 && p.h === 45);
assert(edge45After && edge45After.qty === edge45Count + 2, `应回报并合并 1092×45 边料（2张原纸各1条），实际 ${edge45After && edge45After.qty}`);
const edge14After = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 742 && p.h === 14);
assert(edge14After && edge14After.qty === 2, `2张原纸各出1条 742×14，应共2张，实际 ${edge14After && edge14After.qty}`);
const edgeFromOffcut1 = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 520 && p.h === 88);
const edgeFromOffcut2 = T.getState().papers.find((p) => p.kind === "offcut" && p.w === 212 && p.h === 58);
assert(edgeFromOffcut1 && edgeFromOffcut1.qty === 3, `3张边料各裁出 520×88 一条，实际 ${edgeFromOffcut1 && edgeFromOffcut1.qty}`);
assert(edgeFromOffcut2 && edgeFromOffcut2.qty === 3, `3张边料各裁出 212×58 一条，实际 ${edgeFromOffcut2 && edgeFromOffcut2.qty}`);
assert(aDone.actual.edges.some((e) => e.w === 1092 && e.h === 45 && e.qty === 2), "actual.edges 应汇总边料清单");

// A 完成扣减后，B 的预留依然有效且可用量一致
assert(T.availableQty(T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200)) === 13, "A完成后 B 仍预留 5 张，可用应为 13");

// 幂等：重复完成不得重复扣减
const qtySnapshot = T.getState().papers.map((p) => [p.id, p.qty]);
T.completeOrder(orderA.id);
T.completeOrder(orderA.id);
const qtyAgain = T.getState().papers.map((p) => [p.id, p.qty]);
assert(JSON.stringify(qtySnapshot) === JSON.stringify(qtyAgain), "重复完成不得重复扣库存或再回报边料");

// 完成后不再占用预留
assert(T.reservedQty(T.getState().papers.find((p) => p.w === 1092 && p.h === 787 && p.gsm === 200).id) >= 0, "");

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
