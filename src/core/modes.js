// 扫雷模式预设与自定义参数校验（纯 ESM，零副作用）

export const MODES = {
  beginner: { key: 'beginner', name: '初级', rows: 9, cols: 9, mines: 10 },
  intermediate: { key: 'intermediate', name: '中级', rows: 16, cols: 16, mines: 40 },
  expert: { key: 'expert', name: '高级', rows: 16, cols: 30, mines: 99 },
};

export const CUSTOM_RANGE = { min: 5, max: 60 }; // 行列范围
export const CUSTOM_MAX_DENSITY = 0.8; // 自定义雷数密度上限

/**
 * 把输入规范化为整数；无法转成有限整数时返回 null。
 * 输入可为数字或数字字符串。
 */
function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * 校验自定义模式参数。
 * @param {*} rows
 * @param {*} cols
 * @param {*} mines
 * @returns {{ ok: true, rows: number, cols: number, mines: number }
 *          | { ok: false, error: string }}
 */
export function validateCustom(rows, cols, mines) {
  const r = toInt(rows);
  const c = toInt(cols);
  const m = toInt(mines);

  if (r === null) return { ok: false, error: '行数需为整数' };
  if (c === null) return { ok: false, error: '列数需为整数' };
  if (m === null) return { ok: false, error: '雷数需为整数' };

  if (r < CUSTOM_RANGE.min || r > CUSTOM_RANGE.max) {
    return { ok: false, error: `行数需在 ${CUSTOM_RANGE.min}~${CUSTOM_RANGE.max} 之间` };
  }
  if (c < CUSTOM_RANGE.min || c > CUSTOM_RANGE.max) {
    return { ok: false, error: `列数需在 ${CUSTOM_RANGE.min}~${CUSTOM_RANGE.max} 之间` };
  }

  const total = r * c;
  const maxDensity = Math.floor(total * CUSTOM_MAX_DENSITY); // 密度上限
  const maxSafe = total - 9; // 保留首点安全区

  if (m < 1) {
    return { ok: false, error: `雷数需在 1 到 ${Math.min(maxDensity, maxSafe)} 之间` };
  }
  if (m > maxDensity) {
    return { ok: false, error: `雷数需在 1 到 ${maxDensity} 之间（密度上限 ${CUSTOM_MAX_DENSITY}）` };
  }
  if (m > maxSafe) {
    return { ok: false, error: `雷数需在 1 到 ${maxSafe} 之间（需保留首点安全区）` };
  }

  return { ok: true, rows: r, cols: c, mines: m };
}
