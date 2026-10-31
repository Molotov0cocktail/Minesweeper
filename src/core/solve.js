// 扫雷可解性判定（NSS/SNS + 有界约束枚举）与防猜测局部修复
// 纯 ESM，零 DOM，零副作用。依赖 board.js 的 neighborIndexes、randomMineSet。

import { neighborIndexes, randomMineSet } from './board.js';
import { inferForced } from './constraints.js';

export const MAX_ATTEMPTS = 20;
export const MAX_DENSITY = 0.5;

// v2 高级模式常量
export const MAX_REGION_ATTEMPTS = 20;   // 高级模式区域重排次数默认值
export const MAX_MOVES = 20;             // 减雷移雷轮数上限（内部，不可配置）
export const MAX_MOVE_CANDIDATES = 100;  // 每轮移雷候选位置尝试上限（内部）
export const MAX_TOTAL_DEDUCE = 400;     // 全局 deduce 调用预算（内部，最坏复杂度兜底）

/**
 * 雷密度 = 雷数 / 总格数。
 */
export function density(rows, cols, mines) {
  return mines / (rows * cols);
}

/**
 * 模拟从 startIdx 翻开开始，用「洪泛 + 逻辑推理」推进至不动点，
 * 判定该布局是否可无猜解完（全部非雷格被翻开），并提取不动点状态
 * （unknown / 8-连通簇 / 最小簇）。
 *
 * 推理规则（充分条件启发式）：
 *  - 维护每格状态：revealed（已翻开）/ flagged（推理=雷）/ unknown（未翻开）
 *  - 规则1（翻）：前沿格 A 的 need_A===0 且 cand_A 非空 → 全部翻开 cand_A
 *  - 规则2（标雷）：need_A === cand_A.size → cand_A 全部标 flagged
 *  - 规则3（2-集子集排除）：对任意两前沿格 A、B：
 *      cand_A ⊆ cand_B 且 need_A === need_B → cand_B\cand_A 全部安全 → 翻开
 *      cand_A ⊆ cand_B 且 need_B-need_A === cand_B.size-cand_A.size
 *        → cand_B\cand_A 全部为雷 → 标 flagged
 *  其中 cand_A = A 的相邻 unknown 格集合；need_A = A.count − 相邻 flagged 数。
 *
 * @param {number} rows
 * @param {number} cols
 * @param {Set<number>} mineSet 雷位集合
 * @param {number} startIdx 首次翻开格
 * @returns {{
 *   solved: boolean,
 *   unknown: Set<number>,
 *   clusters: Array<Set<number>>,
 *   smallest: Set<number>|null,
 * }} solved=revealed 数 === rows*cols − mineSet.size；
 *   unknown=不动点仍未判定（未翻开且未标雷，含未标雷的雷）；
 *   clusters=unknown 的 8-连通簇，按 size 升序、同 size 按簇内最小 idx 升序，簇内 idx 升序；
 *   smallest=clusters[0]（unknown 为空时 null）。
 */
export function deduce(rows, cols, mineSet, startIdx) {
  const invalid = () => ({ solved: false, unknown: new Set(), clusters: [], smallest: null });
  if (!Number.isInteger(rows) || rows <= 0 || rows > 60 || !Number.isInteger(cols) || cols <= 0 || cols > 60 ||
      !Number.isSafeInteger(rows * cols) || !(mineSet instanceof Set) ||
      !Number.isInteger(startIdx) || startIdx < 0 || startIdx >= rows * cols || mineSet.has(startIdx)) {
    return invalid();
  }
  const total = rows * cols;
  for (const idx of mineSet) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= total) return invalid();
  }
  const target = total - mineSet.size;

  // 同次推理中的几何关系不变；前沿、洪泛与连通簇共享一份邻居表。
  const adjacent = Array.from({ length: total }, (_, idx) => neighborIndexes(rows, cols, idx));

  // 每格 count：相邻雷数
  const count = new Array(total).fill(0);
  for (const m of mineSet) {
    for (const ni of adjacent[m]) {
      count[ni] += 1;
    }
  }

  const revealed = new Set();
  const flagged = new Set();

  // 翻开某格；count===0 时洪泛扩散。flag 格不会被翻开。返回是否新增翻开。
  const revealCell = (idx) => {
    if (revealed.has(idx) || flagged.has(idx)) return false;
    let changed = false;
    const queue = [idx];
    while (queue.length > 0) {
      const cur = queue.pop();
      if (revealed.has(cur) || flagged.has(cur)) continue;
      revealed.add(cur);
      changed = true;
      if (mineSet.has(cur)) continue; // 雷不扩散
      if (count[cur] === 0) {
        for (const ni of adjacent[cur]) {
          if (!revealed.has(ni) && !flagged.has(ni)) queue.push(ni);
        }
      }
    }
    return changed;
  };

  // 初始翻开 startIdx（含 0 区洪泛）
  revealCell(startIdx);

  // 反复迭代推理直至不动点
  let changed = true;
  while (changed) {
    changed = false;

    // 收集本轮前沿格：已翻开、count>0、存在 unknown（非 revealed/flagged）邻居
    const frontiers = [];
    for (let i = 0; i < total; i++) {
      if (!revealed.has(i) || count[i] === 0) continue;
      const cand = new Set();
      let flaggedCount = 0;
      for (const ni of adjacent[i]) {
        if (flagged.has(ni)) {
          flaggedCount += 1;
        } else if (!revealed.has(ni)) {
          cand.add(ni);
        }
      }
      if (cand.size > 0) {
        frontiers.push({ idx: i, cand, need: count[i] - flaggedCount });
      }
    }

    // 规则1 / 规则2：单格推理
    for (const f of frontiers) {
      if (f.need === 0) {
        const toReveal = [...f.cand].filter((i) => !revealed.has(i) && !flagged.has(i));
        if (toReveal.length > 0) {
          changed = true;
          for (const i of toReveal) revealCell(i);
        }
      } else if (f.need === f.cand.size) {
        const toFlag = [...f.cand].filter((i) => !revealed.has(i) && !flagged.has(i));
        if (toFlag.length > 0) {
          changed = true;
          for (const i of toFlag) flagged.add(i);
        }
      }
    }

    // 规则3：2-集子集排除（两两比较；cand 用 Set 便于子集判断）
    for (let a = 0; a < frontiers.length; a++) {
      for (let b = a + 1; b < frontiers.length; b++) {
        let A = frontiers[a];
        let B = frontiers[b];
        // 每对约束都以较小集合为 A，覆盖两个子集方向，避免扫描顺序影响推理。
        if (A.cand.size === B.cand.size) continue;
        if (A.cand.size > B.cand.size) [A, B] = [B, A];
        let subset = true;
        for (const i of A.cand) {
          if (!B.cand.has(i)) {
            subset = false;
            break;
          }
        }
        if (!subset) continue;
        // 差集 cand_B \ cand_A（仅取仍未翻开/未标雷者）
        const diff = [];
        for (const i of B.cand) {
          if (!A.cand.has(i) && !revealed.has(i) && !flagged.has(i)) diff.push(i);
        }
        if (diff.length === 0) continue;
        if (A.need === B.need) {
          // 差集全部安全 → 翻开（翻到 count===0 继续洪泛）
          changed = true;
          for (const i of diff) revealCell(i);
        } else if (B.need - A.need === B.cand.size - A.cand.size) {
          // 差集全部为雷 → 标 flagged
          changed = true;
          for (const i of diff) flagged.add(i);
        }
      }
    }

    // 廉价规则有进展时先重建前沿，避免为过期约束执行昂贵搜索。
    if (changed) continue;
    const undecided = [];
    for (let i = 0; i < total; i++) {
      if (!revealed.has(i) && !flagged.has(i)) undecided.push(i);
    }
    const remaining = mineSet.size - flagged.size;
    if (undecided.length && (remaining === 0 || remaining === undecided.length)) {
      for (const i of undecided) {
        if (remaining === 0) revealCell(i);
        else flagged.add(i);
      }
      changed = true;
      continue;
    }

    // 只把已翻开的数字和逻辑标雷作为证据，真实雷位仅用于数字/洪泛模拟。
    // 一个分量必须完整搜索后才能输出所有可行布局共同确定的格子；预算截断不猜。
    const forced = inferForced(frontiers.map(f => ({ cells: [...f.cand], mines: f.need })));
    for (const i of forced.safe) {
      if (revealCell(i)) changed = true;
    }
    for (const i of forced.mines) {
      if (!revealed.has(i) && !flagged.has(i)) {
        flagged.add(i);
        changed = true;
      }
    }
  }

  const solved = revealed.size === target;

  // 不动点仍未判定格（未翻开且未标雷，含未标雷的雷）
  const unknown = new Set();
  for (let i = 0; i < total; i++) {
    if (!revealed.has(i) && !flagged.has(i)) unknown.add(i);
  }

  // 8-连通簇（邻接用 board.neighborIndexes）；簇内按 idx 升序插入 Set
  const clusters = [];
  const visited = new Set();
  for (const i of unknown) {
    if (visited.has(i)) continue;
    const member = [];
    const queue = [i];
    visited.add(i);
    while (queue.length > 0) {
      const cur = queue.pop();
      member.push(cur);
      for (const ni of adjacent[cur]) {
        if (unknown.has(ni) && !visited.has(ni)) {
          visited.add(ni);
          queue.push(ni);
        }
      }
    }
    member.sort((a, b) => a - b);
    clusters.push(new Set(member));
  }
  // 簇排序：size 升序，同 size 按簇内最小 idx 升序
  clusters.sort((a, b) => a.size - b.size || Math.min(...a) - Math.min(...b));

  const smallest = clusters.length > 0 ? clusters[0] : null;

  return { solved, unknown, clusters, smallest };
}

/**
 * 可解性判定薄包装：行为与 deduce().solved 恒等。
 *
 * @param {number} rows
 * @param {number} cols
 * @param {Set<number>} mineSet 雷位集合
 * @param {number} startIdx 首次翻开格
 * @returns {boolean} revealed 数 === rows*cols − mineSet.size
 */
export function isSolvable(rows, cols, mineSet, startIdx) {
  return deduce(rows, cols, mineSet, startIdx).solved;
}

/**
 * 防猜测重排：反复随机布雷直到可无猜解完，或达到尝试上限。
 *
 * @param {number} rows
 * @param {number} cols
 * @param {number} mines
 * @param {number} startIdx 首次翻开格（安全区中心）
 * @param {{ maxAttempts?: number, maxDensity?: number, rng?: () => number }} [opts]
 * @returns {{ ok: boolean, reason?: 'density'|'retries', mineSet: Set<number>|null, attempts: number }}
 */
export function generateAntiGuess(rows, cols, mines, startIdx, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const maxDensity = opts.maxDensity ?? MAX_DENSITY;
  const rng = opts.rng ?? Math.random;

  // 密度短路：雷太密无法保证无猜，立即返回，不做任何重排
  if (density(rows, cols, mines) > maxDensity) {
    return { ok: false, reason: 'density', mineSet: null, attempts: 0 };
  }

  let mineSet = null;
  let attempts = 0;
  for (attempts = 1; attempts <= maxAttempts; attempts++) {
    mineSet = randomMineSet(rows, cols, mines, startIdx, rng);
    if (isSolvable(rows, cols, mineSet, startIdx)) {
      return { ok: true, mineSet, attempts };
    }
  }

  return { ok: false, reason: 'retries', mineSet, attempts: maxAttempts };
}

/**
 * 局部防猜测修复：最小歧义簇重排，保留严格进展，必要时移走一雷。
 * 首点安全区、总雷数保持不变；不接受簇外新增歧义。重复布局复用推理结果。
 * attempts 为真实 deduce 调用数，cacheHits 为布局缓存命中数；所有候选评估
 * （包含缓存命中）另限 MAX_TOTAL_DEDUCE 次，防止固定随机序列反复循环。
 * @returns {{ok:boolean,reason?:'density'|'region',mineSet:Set<number>|null,
 *   attempts:number,regionAttempts:number,moves:number,regions:number,cacheHits:number}}
 */
export function generateAntiGuessAdvanced(rows, cols, mines, startIdx, opts = {}) {
  const maxRegionAttempts = opts.maxRegionAttempts ?? MAX_REGION_ATTEMPTS;
  const rng = opts.rng ?? Math.random;
  let regionAttempts = 0;
  let moves = 0;
  let regions = 0;
  let totalDeduce = 0;
  let trials = 0;
  let cacheHits = 0;
  let mineSet = null;
  const result = (ok, reason) => ({
    ok, ...(reason ? { reason } : {}), mineSet,
    attempts: totalDeduce, regionAttempts, moves, regions, cacheHits,
  });

  if (density(rows, cols, mines) > MAX_DENSITY) return result(false, 'density');

  mineSet = randomMineSet(rows, cols, mines, startIdx, rng);
  const safeArea = new Set([startIdx, ...neighborIndexes(rows, cols, startIdx)]);
  const cache = new Map();
  const hasBudget = () => totalDeduce < MAX_TOTAL_DEDUCE && trials < MAX_TOTAL_DEDUCE;
  const evaluate = layout => {
    if (!hasBudget()) return null;
    trials += 1;
    const key = [...layout].sort((a, b) => a - b).join(',');
    if (cache.has(key)) {
      cacheHits += 1;
      return cache.get(key);
    }
    totalDeduce += 1;
    const state = deduce(rows, cols, layout, startIdx);
    cache.set(key, state);
    return state;
  };

  const shuffle = pool => {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  };

  let state = evaluate(mineSet);
  while (state) {
    if (state.solved) return result(true);
    if (!hasBudget()) break;
    // 孤立未知安全格可能依赖其它簇的线索，无法在本簇内重排或减雷。
    // 继续选择按既有顺序排列的最小含雷簇，避免提前放弃仍可修复的布局。
    const region = state.clusters.find(cluster => [...cluster].some(i => mineSet.has(i)));
    if (!region) break;
    regions += 1;
    const regionMines = [...region].filter(i => mineSet.has(i));
    if (!regionMines.length) break;
    const outsideStuck = new Set([...state.unknown].filter(i => !region.has(i)));
    // 状态与布局总是一起提交；失败试排不能污染后续移雷的比较基准。
    const improves = trial => trial.unknown.size < state.unknown.size &&
      [...trial.unknown].every(i => region.has(i) || outsideStuck.has(i));
    let accepted = false;

    const pool = [...region].filter(i => !safeArea.has(i));
    if (pool.length >= regionMines.length) {
      for (let attempt = 0; attempt < maxRegionAttempts && hasBudget(); attempt++) {
        regionAttempts += 1;
        const layout = new Set([...mineSet].filter(i => !region.has(i)));
        for (const i of shuffle([...pool]).slice(0, regionMines.length)) layout.add(i);
        const trial = evaluate(layout);
        if (trial.solved) {
          mineSet = layout;
          return result(true);
        }
        if (improves(trial)) {
          mineSet = layout;
          state = trial;
          accepted = true;
          break;
        }
      }
    }
    if (accepted) continue;
    if (!hasBudget() || moves >= MAX_MOVES) break;

    const removed = regionMines[Math.floor(rng() * regionMines.length)];
    const candidates = [];
    for (let i = 0; i < rows * cols; i++) {
      if (!region.has(i) && !safeArea.has(i) && !mineSet.has(i)) candidates.push(i);
    }
    shuffle(candidates);
    for (const destination of candidates.slice(0, MAX_MOVE_CANDIDATES)) {
      if (!hasBudget()) break;
      const layout = new Set(mineSet);
      layout.delete(removed);
      layout.add(destination);
      const trial = evaluate(layout);
      if (trial.solved || improves(trial)) {
        mineSet = layout;
        state = trial;
        moves += 1;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
  }
  return result(false, 'region');
}
