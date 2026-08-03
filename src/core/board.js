// 扫雷棋盘核心数据模型（纯 ESM，零 DOM，零副作用）
// 棋盘用一维扁平索引：idx = row * cols + col

export const CELL_HIDDEN = 'hidden';
export const CELL_FLAGGED = 'flagged';
export const CELL_QUESTIONED = 'questioned';
export const CELL_REVEALED = 'revealed';

/**
 * 创建棋盘。
 * Cell = { idx, row, col, isMine, count, state }
 * @returns {{ rows, cols, mines, cells: Cell[], revealedCount: number, flagCount: number, minesPlaced: boolean }}
 */
export function createBoard(rows, cols, mines) {
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      cells.push({ idx, row, col, isMine: false, count: 0, state: CELL_HIDDEN });
    }
  }
  return {
    rows,
    cols,
    mines,
    cells,
    revealedCount: 0,
    flagCount: 0,
    minesPlaced: false,
  };
}

/**
 * 行列坐标转一维索引。越界返回 -1。
 */
export function indexAt(rows, cols, row, col) {
  if (row < 0 || col < 0 || row >= rows || col >= cols) return -1;
  return row * cols + col;
}

/**
 * 按坐标取格子。越界返回 undefined。
 */
export function cellAt(board, row, col) {
  const idx = indexAt(board.rows, board.cols, row, col);
  if (idx === -1) return undefined;
  return board.cells[idx];
}

/**
 * 一维索引的邻居索引数组：最多 8 个，不含自身，升序。
 */
export function neighborIndexes(rows, cols, idx) {
  const row = Math.floor(idx / cols);
  const col = idx % cols;
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        result.push(r * cols + c);
      }
    }
  }
  return result;
}

/**
 * 按坐标取邻居 Cell 数组（越界自动过滤）。越界坐标返回空数组。
 */
export function neighborsOf(board, row, col) {
  const idx = indexAt(board.rows, board.cols, row, col);
  if (idx === -1) return [];
  return neighborIndexes(board.rows, board.cols, idx).map((i) => board.cells[i]);
}

/**
 * 生成雷位集合：候选池 = 除 safeIdx 及其 8 邻居外的全部格子，
 * 用 Fisher–Yates 从候选池抽取 mines 个（j = floor(rng()*(i+1)) 交换）。
 * 候选池不足 mines 时抛 Error('Mine pool too small')。
 * @returns {Set<number>}
 */
export function randomMineSet(rows, cols, mines, safeIdx, rng = Math.random) {
  const total = rows * cols;
  const excluded = new Set([safeIdx, ...neighborIndexes(rows, cols, safeIdx)]);
  const pool = [];
  for (let i = 0; i < total; i++) {
    if (!excluded.has(i)) pool.push(i);
  }
  if (pool.length < mines) {
    throw new Error('Mine pool too small');
  }
  // Fisher–Yates 洗牌（后向），取前 mines 个
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return new Set(pool.slice(0, mines));
}

/**
 * 直接用给定 mineSet 布雷：写 isMine、计算每格 count、置 minesPlaced。返回 board。
 */
export function setMines(board, mineSet) {
  const cells = board.cells;
  for (let i = 0; i < cells.length; i++) {
    cells[i].isMine = mineSet.has(i);
    cells[i].count = 0;
  }
  for (const idx of mineSet) {
    for (const ni of neighborIndexes(board.rows, board.cols, idx)) {
      cells[ni].count += 1;
    }
  }
  board.minesPlaced = true;
  return board;
}

/**
 * 随机布雷（首点安全）：= setMines(board, randomMineSet(rows, cols, mines, safeIdx))。
 * 返回 board。
 */
export function placeMines(board, safeIdx) {
  return setMines(board, randomMineSet(board.rows, board.cols, board.mines, safeIdx));
}

/**
 * 翻开格子，0 区洪泛扩散。
 * - board.minesPlaced 为 false → 空结果
 * - 非 hidden 状态（旗/问号/已翻开）→ 不操作
 * - 是雷 → 置 revealed，exploded=true
 * - 非雷且 count===0 → BFS 洪泛翻开相邻 0 区
 * @returns {{ revealed: number[], exploded: boolean }} revealed=本次新翻开索引（含雷）
 */
export function reveal(board, row, col) {
  if (!board.minesPlaced) return { revealed: [], exploded: false };
  const idx = indexAt(board.rows, board.cols, row, col);
  if (idx === -1) return { revealed: [], exploded: false };
  if (board.cells[idx].state !== CELL_HIDDEN) {
    return { revealed: [], exploded: false };
  }

  const revealed = [];
  let exploded = false;
  const queue = [idx];
  const visited = new Set();

  while (queue.length > 0) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const cell = board.cells[cur];
    if (cell.state !== CELL_HIDDEN) continue;

    cell.state = CELL_REVEALED;
    board.revealedCount += 1;
    revealed.push(cur);

    if (cell.isMine) {
      exploded = true;
      continue; // 雷不再向外扩散
    }
    if (cell.count === 0) {
      for (const ni of neighborIndexes(board.rows, board.cols, cur)) {
        if (!visited.has(ni)) queue.push(ni);
      }
    }
  }

  return { revealed, exploded };
}

/**
 * 左键 chord：已翻开且 count>0 的格子上，
 * 相邻旗数 == count 且存在未翻开邻居时，翻开全部相邻未翻开格（洪泛 0 区同样适用）。
 * 其中有雷 → exploded=true。
 * @returns {{ revealed: number[], exploded: boolean }}
 */
export function chordLeft(board, row, col) {
  const idx = indexAt(board.rows, board.cols, row, col);
  if (idx === -1) return { revealed: [], exploded: false };
  const cell = board.cells[idx];
  if (cell.state !== CELL_REVEALED || cell.count === 0) {
    return { revealed: [], exploded: false };
  }

  const neighbors = neighborIndexes(board.rows, board.cols, idx);
  const flaggedCount = neighbors.filter((i) => board.cells[i].state === CELL_FLAGGED).length;
  const unopened = neighbors.filter((i) => board.cells[i].state !== CELL_REVEALED);
  if (flaggedCount !== cell.count || unopened.length === 0) {
    return { revealed: [], exploded: false };
  }

  // 洪泛翻开所有未翻开邻居
  const revealed = [];
  let exploded = false;
  const queue = [...unopened];
  const visited = new Set();

  while (queue.length > 0) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const c = board.cells[cur];
    if (c.state !== CELL_HIDDEN) continue;

    c.state = CELL_REVEALED;
    board.revealedCount += 1;
    revealed.push(cur);

    if (c.isMine) {
      exploded = true;
      continue;
    }
    if (c.count === 0) {
      for (const ni of neighborIndexes(board.rows, board.cols, cur)) {
        if (!visited.has(ni)) queue.push(ni);
      }
    }
  }

  return { revealed, exploded };
}

/**
 * 右键 chord：已翻开且 count>0 的格子上，
 * count == 相邻未翻开格数 且 flagCount + 本次新增旗数 <= mines 时，
 * 全部相邻未翻开格标旗（已标旗者跳过）。
 * 超限 → { blocked: true, flagged: [] }（不标任何旗）。
 * @returns {{ flagged: number[] }} | {{ blocked: true, flagged: [] }}
 */
export function chordRight(board, row, col) {
  const idx = indexAt(board.rows, board.cols, row, col);
  if (idx === -1) return { flagged: [] };
  const cell = board.cells[idx];
  if (cell.state !== CELL_REVEALED || cell.count === 0) {
    return { flagged: [] };
  }

  const neighbors = neighborIndexes(board.rows, board.cols, idx);
  // 未翻开 = 非 revealed（含 hidden/flagged/questioned）
  const unopened = neighbors.filter((i) => board.cells[i].state !== CELL_REVEALED);
  if (cell.count !== unopened.length) return { flagged: [] };

  // 本次真正需要新增的旗（已标旗者不计入）
  const toFlag = unopened.filter((i) => board.cells[i].state !== CELL_FLAGGED);
  if (board.flagCount + toFlag.length > board.mines) {
    return { blocked: true, flagged: [] };
  }

  for (const i of toFlag) {
    board.cells[i].state = CELL_FLAGGED;
  }
  board.flagCount += toFlag.length;
  return { flagged: toFlag };
}

/**
 * 标记循环：hidden → flagged（旗满则 blocked）→ questioned → hidden。
 * 已翻开格不操作。
 * @returns {{ state: string, blocked: boolean }}
 */
export function cycleMark(board, row, col) {
  const idx = indexAt(board.rows, board.cols, row, col);
  if (idx === -1) return { state: undefined, blocked: false };
  const cell = board.cells[idx];

  if (cell.state === CELL_HIDDEN) {
    if (board.flagCount < board.mines) {
      cell.state = CELL_FLAGGED;
      board.flagCount += 1;
      return { state: CELL_FLAGGED, blocked: false };
    }
    return { state: CELL_HIDDEN, blocked: true };
  }
  if (cell.state === CELL_FLAGGED) {
    cell.state = CELL_QUESTIONED;
    board.flagCount -= 1;
    return { state: CELL_QUESTIONED, blocked: false };
  }
  if (cell.state === CELL_QUESTIONED) {
    cell.state = CELL_HIDDEN;
    return { state: CELL_HIDDEN, blocked: false };
  }
  // 已翻开：不操作
  return { state: cell.state, blocked: false };
}

/**
 * 胜利判定：已翻开格数 == 总格数 - 雷数。
 */
export function isWin(board) {
  return board.revealedCount === board.rows * board.cols - board.mines;
}

/**
 * 失败结算：把所有雷置 revealed，返回雷索引数组。
 * @returns {number[]}
 */
export function revealAllMines(board) {
  const mines = [];
  for (const cell of board.cells) {
    if (cell.isMine) {
      cell.state = CELL_REVEALED;
      mines.push(cell.idx);
    }
  }
  return mines;
}
