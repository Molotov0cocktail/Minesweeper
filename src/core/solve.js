// 扫雷可解性判定（NSS 单格 + SNS 2-集子集排除）与防猜测重排生成器
// 纯 ESM，零 DOM，零副作用。依赖 board.js 的 neighborIndexes、randomMineSet。

import { neighborIndexes, randomMineSet } from './board.js';

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
 * 防猜测高级模式：歧义连通簇检测 → 区域重排 → 减雷移雷循环。
 *
 * 算法（详细设计 §3 伪代码）：
 *  1) density > MAX_DENSITY → { ok:false, reason:'density', mineSet:null, 统计全 0 }
 *  2) 外层循环（每轮 = 一次区域级调整）：
 *     a. deduce → solved 即成功；R ← 最小歧义簇；mR ← |mineSet ∩ R|；
 *        mR===0 → 失败；poolR ← {i ∈ R : i ∉ 首点安全区}（idx 升序）
 *        |poolR| < mR → 跳过区域重排直接进 c
 *     b. 区域重排（簇外雷固定；每轮局部计数 resetRound 从 0 起）：
 *        while resetRound < maxRegionAttempts 且 totalDeduce < MAX_TOTAL_DEDUCE:
 *          每轮重算 rMines ← |mineSet ∩ R|；poolR 内 Fisher–Yates（rng 注入）取前 rMines 个；
 *          newMineSet ← (mineSet \ (R 内雷)) ∪ 新排布；deduce → solved 即成功
 *     c. 减雷移雷：预算/上限检查；outsideStuck ← state.unknown \ R；
 *        removed ← R∩mineSet（升序）按 rng 随机取一雷；
 *        候选 ← 全盘非安全区非 R 非雷格（idx 升序）洗牌取前 MAX_MOVE_CANDIDATES；
 *        对每个候选：deduce；solved → 成功；否则 (s2.unknown \ R) ⊆ outsideStuck → 接受回外层循环
 *  3) 失败 → { ok:false, reason:'region', mineSet:<最后一次可用布局>, ...统计 }
 *
 * @param {number} rows
 * @param {number} cols
 * @param {number} mines
 * @param {number} startIdx 首次翻开格（安全区中心）
 * @param {{ maxRegionAttempts?: number, rng?: () => number }} [opts]
 * @returns {{
 *   ok: boolean,
 *   reason?: 'density'|'region',
 *   mineSet: Set<number>|null,
 *   attempts: number,
 *   regionAttempts: number,
 *   moves: number,
 *   regions: number,
 * }}
 */
export function generateAntiGuessAdvanced(rows, cols, mines, startIdx, opts = {}) {
  const maxRegionAttempts = opts.maxRegionAttempts ?? MAX_REGION_ATTEMPTS;
  const rng = opts.rng ?? Math.random;

  let regionAttempts = 0;
  let moves = 0;
  let regions = 0;
  let totalDeduce = 0;

  // 密度短路：与标准模式一致，全统计 0，mineSet null
  if (density(rows, cols, mines) > MAX_DENSITY) {
    return {
      ok: false,
      reason: 'density',
      mineSet: null,
      attempts: 0,
      regionAttempts: 0,
      moves: 0,
      regions: 0,
    };
  }

  // 初始布局（从 board.js 具名 import，测试 mock 依赖）
  let mineSet = randomMineSet(rows, cols, mines, startIdx, rng);

  const safeArea = new Set([startIdx, ...neighborIndexes(rows, cols, startIdx)]);

  // Fisher–Yates 洗牌（后向，j = floor(rng()*(i+1))，与 board.randomMineSet 相同模式），原地
  const shuffle = (pool) => {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool;
  };

  // 当前 mineSet 与给定集合的交集雷数
  const countMinesIn = (set) => {
    let n = 0;
    for (const i of set) if (mineSet.has(i)) n += 1;
    return n;
  };

  while (totalDeduce < MAX_TOTAL_DEDUCE) {
    // a. 外层循环每轮 = 一次区域级调整
    const state = deduce(rows, cols, mineSet, startIdx);
    totalDeduce += 1;
    if (state.solved) {
      return { ok: true, mineSet, attempts: totalDeduce, regionAttempts, moves, regions };
    }

    const R = state.smallest;
    if (!R) break;
    regions += 1;

    const mR = countMinesIn(R);
    if (mR === 0) break; // 簇内无雷：既无法重排也无法减雷 → 失败

    // b. 区域重排（簇外雷全部固定；每轮局部计数 resetRound 从 0 起）
    const poolR = [...R].filter((i) => !safeArea.has(i));
    if (poolR.length >= mR) {
      let resetRound = 0;
      while (resetRound < maxRegionAttempts && totalDeduce < MAX_TOTAL_DEDUCE) {
        regionAttempts += 1;
        resetRound += 1;
        totalDeduce += 1;
        // 每轮重算 rMines = 当前 mineSet ∩ R 的雷数（雷位随重排变化，雷数不变）
        const rMines = countMinesIn(R);
        const newMinesInR = shuffle([...poolR]).slice(0, rMines);
        const newMineSet = new Set();
        for (const m of mineSet) if (!R.has(m)) newMineSet.add(m);
        for (const m of newMinesInR) newMineSet.add(m);
        const trial = deduce(rows, cols, newMineSet, startIdx);
        if (trial.solved) {
          return { ok: true, mineSet: newMineSet, attempts: totalDeduce, regionAttempts, moves, regions };
        }
      }
    }

    // c. 减雷移雷（区域重排耗尽或簇全雷/池不足）
    if (totalDeduce >= MAX_TOTAL_DEDUCE || moves >= MAX_MOVES) break;

    // 以当前 mineSet 的推理状态为基准，失败试排的状态不能污染移雷验证。
    const outsideStuck = new Set();
    for (const i of state.unknown) if (!R.has(i)) outsideStuck.add(i);

    // 从 R 内雷（idx 升序）中按 rng 随机取一颗移走
    const mineInR = [];
    for (const i of R) if (mineSet.has(i)) mineInR.push(i);
    const removed = mineInR[Math.floor(rng() * mineInR.length)];

    // 候选：全盘非安全区非 R 非雷格（idx 升序）洗牌后取前 MAX_MOVE_CANDIDATES
    const candidatePool = [];
    for (let i = 0; i < rows * cols; i++) {
      if (!R.has(i) && !safeArea.has(i) && !mineSet.has(i)) candidatePool.push(i);
    }
    shuffle(candidatePool);
    const candidates = candidatePool.slice(0, MAX_MOVE_CANDIDATES);

    let accepted = false;
    for (const c of candidates) {
      if (totalDeduce >= MAX_TOTAL_DEDUCE) break;
      totalDeduce += 1;
      const m2 = new Set(mineSet);
      m2.delete(removed);
      m2.add(c);
      const s2 = deduce(rows, cols, m2, startIdx);
      if (s2.solved) {
        mineSet = m2;
        moves += 1;
        return { ok: true, mineSet, attempts: totalDeduce, regionAttempts, moves, regions };
      }
      // 接受条件：(s2.unknown \ R) ⊆ outsideStuck —— 移雷后正常区域的新歧义
      // 不超出移雷前正常区域既有歧义；允许移入其它既有歧义簇，禁止在干净区域制造新歧义
      let subset = true;
      for (const i of s2.unknown) {
        if (!R.has(i) && !outsideStuck.has(i)) {
          subset = false;
          break;
        }
      }
      if (subset) {
        mineSet = m2;
        moves += 1;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
  }

  return {
    ok: false,
    reason: 'region',
    mineSet,
    attempts: totalDeduce,
    regionAttempts,
    moves,
    regions,
  };
}
