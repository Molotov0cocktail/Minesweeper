// 扫雷可解性判定（NSS 单格 + SNS 2-集子集排除）与防猜测重排生成器
// 纯 ESM，零 DOM，零副作用。依赖 board.js 的 neighborIndexes、randomMineSet。

import { neighborIndexes, randomMineSet } from './board.js';

export const MAX_ATTEMPTS = 20;
export const MAX_DENSITY = 0.5;

/**
 * 雷密度 = 雷数 / 总格数。
 */
export function density(rows, cols, mines) {
  return mines / (rows * cols);
}

/**
 * 模拟从 startIdx 翻开开始，用「洪泛 + 逻辑推理」推进至不动点，
 * 判定该布局是否可无猜解完（全部非雷格被翻开）。
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
 * @returns {boolean} revealed 数 === rows*cols − mineSet.size
 */
export function isSolvable(rows, cols, mineSet, startIdx) {
  const total = rows * cols;
  const target = total - mineSet.size;

  // 每格 count：相邻雷数
  const count = new Array(total).fill(0);
  for (const m of mineSet) {
    for (const ni of neighborIndexes(rows, cols, m)) {
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
        for (const ni of neighborIndexes(rows, cols, cur)) {
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
      for (const ni of neighborIndexes(rows, cols, i)) {
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
      const A = frontiers[a];
      for (let b = a + 1; b < frontiers.length; b++) {
        const B = frontiers[b];
        // 需要 cand_A ⊊ cand_B 才可能有非空差集
        if (A.cand.size >= B.cand.size) continue;
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
  }

  return revealed.size === target;
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
