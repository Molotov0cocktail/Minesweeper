/**
 * src/core/settings.js
 * 防猜测等用户设置持久化（纯 ESM，零 DOM；storage 注入可单测）。
 *
 * 存储结构（localStorage 中的 JSON 字符串）：
 *   { antiGuess: boolean, antiGuessMethod: 'standard'|'advanced',
 *     maxAttempts: int[1,200], maxRegionAttempts: int[1,200],
 *     gamepadBindings: { [action]: buttonIndex }, focusView: boolean }
 *
 * 读取全字段 sanitize（损坏 JSON / 非对象 / 字段非法 → 回退默认）；
 * update 逐字段校验，非法字段忽略（保留现值）；reset 恢复默认并持久化。
 * storage 抛错（getItem/setItem）时自动降级为内存模式，不崩溃。
 */

import { DEFAULT_GAMEPAD_BINDINGS, isValidGamepadBindings } from './gamepad.js';

export const SETTINGS_KEY = 'minesweeper.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  antiGuess: true,              // 防猜测总开关
  antiGuessMethod: 'standard',  // 'standard' | 'advanced'
  maxAttempts: 20,              // 标准模式最大重置轮数
  maxRegionAttempts: 20,        // 高级模式区域重排次数
  gamepadBindings: Object.freeze({ ...DEFAULT_GAMEPAD_BINDINGS }),
  focusView: false,
});

export const LIMITS = Object.freeze({
  maxAttempts: [1, 200],
  maxRegionAttempts: [1, 200],
});

const ANTI_GUESS_METHODS = new Set(['standard', 'advanced']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWithinLimit(value, key) {
  const [min, max] = LIMITS[key];
  return Number.isInteger(value) && value >= min && value <= max;
}

function copySettings(settings) {
  return { ...settings, gamepadBindings: { ...settings.gamepadBindings } };
}

function copyField(key, value) {
  return key === 'gamepadBindings' ? { ...value } : value;
}

// 字段合法性判断（get 与 update 共用）：仅识别契约中的已知字段
function isValidField(key, value) {
  switch (key) {
    case 'antiGuess':
    case 'focusView':
      return typeof value === 'boolean';
    case 'gamepadBindings':
      return isValidGamepadBindings(value);
    case 'antiGuessMethod':
      return ANTI_GUESS_METHODS.has(value);
    case 'maxAttempts':
    case 'maxRegionAttempts':
      return isWithinLimit(value, key);
    default:
      return false;
  }
}

export function createSettings(storage = globalThis.localStorage) {
  let cache = null; // 已 sanitize 的设置；null 表示尚未加载
  let degraded = false; // storage 不可用（抛错）时置 true，之后全部走内存

  function load() {
    if (cache !== null) return cache;
    cache = copySettings(DEFAULT_SETTINGS);
    if (degraded) return cache;
    try {
      const raw = storage.getItem(SETTINGS_KEY);
      if (raw === null || raw === undefined) return cache;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return cache; // 损坏 JSON → 全默认
      }
      if (!isPlainObject(parsed)) return cache; // 非对象（数组/字符串/数字）→ 全默认
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        // 读取 sanitize：非法字段回退默认值
        cache[key] = copyField(key, isValidField(key, parsed[key]) ? parsed[key] : DEFAULT_SETTINGS[key]);
      }
    } catch {
      degraded = true; // getItem 抛错 → 内存降级
      cache = copySettings(DEFAULT_SETTINGS);
    }
    return cache;
  }

  function persist(data) {
    if (degraded) return;
    try {
      storage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch {
      degraded = true; // setItem 抛错 → 静默降级，保持内存可用
    }
  }

  function get() {
    return copySettings(load());
  }

  function update(patch) {
    const current = load();
    if (!isPlainObject(patch)) return copySettings(current);
    let changed = false;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!(key in patch)) continue;
      if (!isValidField(key, patch[key])) continue; // 非法字段忽略，保留现值
      const unchanged = key === 'gamepadBindings'
        ? Object.keys(DEFAULT_GAMEPAD_BINDINGS).every(action => current[key][action] === patch[key][action])
        : current[key] === patch[key];
      if (!unchanged) {
        current[key] = copyField(key, patch[key]);
        changed = true;
      }
    }
    if (changed) persist(current); // 有合法变更才写 storage
    return copySettings(current);
  }

  function reset() {
    cache = copySettings(DEFAULT_SETTINGS);
    persist(cache);
    return copySettings(cache);
  }

  return { get, update, reset };
}
