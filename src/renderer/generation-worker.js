// 首点生成在专用 Worker 中运行；纯生成函数也可在 Node 中直接验证。
import { randomMineSet, neighborIndexes } from '../core/board.js';
import { generateAntiGuessAdvanced } from '../core/solve.js';

const WARNING_DENSITY = '防猜测已关闭：雷密度过高，无法保证无猜';
const WARNING_FAILURE = '防猜测已关闭：生成超时或失败，已切换普通开局';

function safeLayout(layout, rows, cols, mines, startIdx) {
  if (!(layout instanceof Set) || layout.size !== mines) return false;
  const excluded = new Set([startIdx, ...neighborIndexes(rows, cols, startIdx)]);
  for (const index of layout) {
    if (!Number.isInteger(index) || index < 0 || index >= rows * cols || excluded.has(index)) return false;
  }
  return true;
}

function summary(result) {
  if (!result || typeof result !== 'object') return null;
  const { mineSet, ...stats } = result;
  return stats;
}

/** 返回可结构化克隆的开局，防猜测状态以实际生成结果为准。 */
export function generateOpening(config, startIdx) {
  const { rows, cols, mines, maxRegionAttempts = 20 } = config || {};
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1 ||
      !Number.isInteger(mines) || mines < 0 || !Number.isInteger(startIdx) || startIdx < 0 || startIdx >= rows * cols) {
    throw new Error('开局参数无效');
  }

  if (config.antiGuess === false) {
    return { mineSet: [...randomMineSet(rows, cols, mines, startIdx)], antiGuessActive: false, warning: null, stats: null };
  }
  const result = generateAntiGuessAdvanced(rows, cols, mines, startIdx, { maxRegionAttempts });
  const stats = summary(result);

  let warning = null;
  const valid = safeLayout(result?.mineSet, rows, cols, mines, startIdx);
  const antiGuessActive = result?.ok === true && valid;
  if (!antiGuessActive) {
    if (result?.reason === 'density') warning = WARNING_DENSITY;
    else if (result?.reason === 'region') warning = '防猜测已关闭：局部修复预算耗尽，已切换普通开局';
    else warning = WARNING_FAILURE;
  }
  const mineSet = valid ? result.mineSet : randomMineSet(rows, cols, mines, startIdx);
  return { mineSet: [...mineSet], antiGuessActive, warning, stats };
}

// Window 和 Node import 均不注册监听，避免污染宿主全局生命周期。
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.addEventListener('message', ({ data }) => {
    const { id, config, startIdx } = data || {};
    try {
      globalThis.postMessage({ id, result: generateOpening(config, startIdx) });
    } catch {
      globalThis.postMessage({ id, error: '棋盘生成失败，请重新开始' });
    }
  });
}
