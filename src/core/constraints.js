// 对前沿数字约束做有界、确定性的枚举。仅返回全部可行解共同确定的格子。
// 纯 ESM，无 DOM、随机数或宿主状态；搜索中断的分量不提供推理结论。

const DEFAULT_MAX_VARIABLES = 20;
const DEFAULT_MAX_NODES = 100000;

/**
 * @param {Array<{cells:number[], mines:number}>} constraints
 * @param {{maxVariables?:number, maxNodes?:number}} [options]
 * @returns {{safe:Set<number>, mines:Set<number>, complete:boolean, nodes:number}}
 */
export function inferForced(constraints, options = {}) {
  const safe = new Set();
  const mines = new Set();
  let complete = true;
  let nodes = 0;
  const result = () => ({ safe, mines, complete, nodes });
  const invalid = () => ({ safe: new Set(), mines: new Set(), complete: false, nodes });
  if (!Array.isArray(constraints)) return invalid();
  if (options === null || typeof options !== 'object') return invalid();
  const maxVariables = options.maxVariables ?? DEFAULT_MAX_VARIABLES;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  if (!Number.isSafeInteger(maxVariables) || maxVariables < 0 ||
      !Number.isSafeInteger(maxNodes) || maxNodes < 0) return invalid();

  // 复制规则，并建立“变量 -> 包含该变量的规则”索引，不改变调用方数据。
  const rules = [];
  const membership = new Map();
  for (const rule of constraints) {
    if (!rule || !Array.isArray(rule.cells) || !Number.isInteger(rule.mines) ||
        rule.mines < 0 || rule.mines > rule.cells.length) return invalid();
    const cells = [...rule.cells];
    const unique = new Set();
    for (const cell of cells) {
      if (!Number.isSafeInteger(cell) || cell < 0 || unique.has(cell)) return invalid();
      unique.add(cell);
    }
    if (cells.length === 0) continue;
    const index = rules.length;
    rules.push({ cells, mines: rule.mines });
    for (const cell of cells) {
      if (!membership.has(cell)) membership.set(cell, []);
      membership.get(cell).push(index);
    }
  }

  // 按共享变量切分独立分量。大分量跳过后仍能求解独立的小分量。
  const visited = new Set();
  for (let initial = 0; initial < rules.length; initial++) {
    if (visited.has(initial)) continue;
    const componentRules = [];
    const componentCells = new Set();
    const pending = [initial];
    visited.add(initial);
    while (pending.length) {
      const index = pending.pop();
      componentRules.push(index);
      for (const cell of rules[index].cells) {
        if (componentCells.has(cell)) continue;
        componentCells.add(cell);
        for (const next of membership.get(cell)) {
          if (visited.has(next)) continue;
          visited.add(next);
          pending.push(next);
        }
      }
    }
    if (componentCells.size > maxVariables || nodes >= maxNodes) {
      complete = false;
      continue;
    }

    // 高参与度变量优先，尽早使约束超界，从而剪掉无效分支。
    const cells = [...componentCells].sort((a, b) => membership.get(b).length - membership.get(a).length || a - b);
    const localRuleIndex = new Map(componentRules.map((index, local) => [index, local]));
    const variableRules = cells.map(cell => membership.get(cell).map(index => localRuleIndex.get(index)));
    const target = componentRules.map(index => rules[index].mines);
    const remaining = componentRules.map(index => rules[index].cells.length);
    const assignedMines = new Array(componentRules.length).fill(0);
    const assignment = new Uint8Array(cells.length);
    const seenSafe = new Uint8Array(cells.length);
    const seenMine = new Uint8Array(cells.length);
    let foundSolution = false;
    let aborted = false;

    function search(position) {
      if (nodes >= maxNodes) {
        aborted = true;
        return;
      }
      nodes += 1;
      if (position === cells.length) {
        foundSolution = true;
        for (let i = 0; i < cells.length; i++) {
          if (assignment[i]) seenMine[i] = 1;
          else seenSafe[i] = 1;
        }
        return;
      }
      const affected = variableRules[position];
      for (const index of affected) remaining[index] -= 1;
      for (let value = 0; value <= 1; value++) {
        assignment[position] = value;
        let feasible = true;
        for (const index of affected) {
          assignedMines[index] += value;
          if (assignedMines[index] > target[index] ||
              assignedMines[index] + remaining[index] < target[index]) feasible = false;
        }
        if (feasible) search(position + 1);
        for (const index of affected) assignedMines[index] -= value;
        if (aborted) break;
      }
      for (const index of affected) remaining[index] += 1;
    }

    search(0);
    if (aborted) {
      complete = false;
      continue;
    }
    // 矛盾规则不能产生“所有零个解都满足”的虚假确定值。
    if (!foundSolution) return invalid();
    for (let i = 0; i < cells.length; i++) {
      if (!seenMine[i]) safe.add(cells[i]);
      else if (!seenSafe[i]) mines.add(cells[i]);
    }
  }
  return result();
}
