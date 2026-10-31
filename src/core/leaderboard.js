/**
 * src/core/leaderboard.js
 * 排行榜：按 (模式 × 防猜测实际开关) 分组的 Top-10 存取 + 昵称记忆。
 *
 * 存储结构（localStorage 中的 JSON 字符串）：
 *   { [mode]: { on: [entry...], off: [entry...] }, lastNickname?: string }
 *   entry = { nickname: string, timeMs: number, date: string /* ISO *\/ }
 *
 * 纯 ESM、零 DOM 依赖；localStorage 由调用方注入（测试注入内存 mock）。
 * storage 抛错（getItem/setItem/removeItem）时自动降级为内存模式，不崩溃。
 */

export const LEADERBOARD_KEY = 'minesweeper.leaderboard.v1';
export const TOP_N = 10;
export const LEADERBOARD_MODES = ['beginner', 'intermediate', 'expert'];

const DEFAULT_NICKNAME = '玩家';
const NICKNAME_MAX_LEN = 16;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidTime(timeMs) {
  return typeof timeMs === 'number' && Number.isFinite(timeMs) && timeMs >= 0;
}

function normalizeNickname(name) {
  return (typeof name === 'string' ? name.trim() : '').slice(0, NICKNAME_MAX_LEN) || DEFAULT_NICKNAME;
}

// 只信任已知模式与有效成绩，部分损坏不影响同一存档中的合法记录。
function sanitizeData(parsed) {
  const data = {};
  if (!isPlainObject(parsed)) return data;
  for (const mode of LEADERBOARD_MODES) {
    const group = parsed[mode];
    if (!isPlainObject(group)) continue;
    data[mode] = {};
    for (const key of ['on', 'off']) {
      const list = Array.isArray(group[key]) ? group[key] : [];
      data[mode][key] = list
        .filter((entry) => isPlainObject(entry) && isValidTime(entry.timeMs) && typeof entry.nickname === 'string')
        .map((entry) => ({
          nickname: normalizeNickname(entry.nickname),
          timeMs: entry.timeMs,
          date: typeof entry.date === 'string' ? entry.date : '',
        }))
        .sort((a, b) => a.timeMs - b.timeMs)
        .slice(0, TOP_N);
    }
  }
  if (typeof parsed.lastNickname === 'string') data.lastNickname = normalizeNickname(parsed.lastNickname);
  return data;
}

export function createLeaderboard(storage = globalThis.localStorage) {
  let cache = null; // 已解析的数据对象；null 表示尚未加载
  let degraded = false; // storage 不可用（抛错）时置 true，之后全部走内存

  function load() {
    if (cache !== null) return cache;
    try {
      const raw = storage.getItem(LEADERBOARD_KEY);
      if (raw === null || raw === undefined) {
        cache = {};
      } else {
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null; // 损坏 JSON → 视为空，下次写入时自动修复
        }
        cache = sanitizeData(parsed);
      }
    } catch {
      degraded = true; // getItem 抛错 → 内存降级
      cache = {};
    }
    return cache;
  }

  function persist(data) {
    if (degraded) return;
    try {
      storage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
    } catch {
      degraded = true; // setItem 抛错 → 不再尝试写 storage，保持内存可用
    }
  }

  function getBucketList(mode, antiGuess) {
    if (!LEADERBOARD_MODES.includes(mode)) return undefined;
    const data = load();
    const group = data[mode];
    if (!isPlainObject(group)) return undefined;
    const list = group[antiGuess ? 'on' : 'off'];
    return Array.isArray(list) ? list : undefined;
  }

  function getScores(mode, antiGuess) {
    const list = getBucketList(mode, antiGuess) || [];
    // 缓存已排序且仅包含标量字段；复制条目以防调用方改写缓存与后续存档。
    return list.map((entry) => ({ ...entry }));
  }

  function isTopTen(mode, antiGuess, timeMs) {
    if (!LEADERBOARD_MODES.includes(mode) || !isValidTime(timeMs)) return false;
    const scores = getScores(mode, antiGuess);
    if (scores.length < TOP_N) return true;
    // 同分后写排在已有成绩之后，满榜并列第十实际会排第十一。
    return timeMs < scores[scores.length - 1].timeMs;
  }

  function addScore(mode, antiGuess, nickname, timeMs) {
    if (!LEADERBOARD_MODES.includes(mode) || !isValidTime(timeMs)) {
      return { added: false, rank: undefined };
    }
    const data = load();
    const key = antiGuess ? 'on' : 'off';
    if (!isPlainObject(data[mode])) data[mode] = { on: [], off: [] };
    if (!Array.isArray(data[mode][key])) data[mode][key] = [];
    const bucket = data[mode][key];

    const entry = {
      nickname: normalizeNickname(nickname),
      timeMs,
      date: new Date().toISOString(),
    };
    bucket.push(entry);
    // Array.prototype.sort 自 ES2019 起稳定，相等 timeMs 时后写入的排在后面
    bucket.sort((a, b) => a.timeMs - b.timeMs);

    const index = bucket.indexOf(entry);
    const added = index < TOP_N;
    const rank = added ? index + 1 : undefined;
    if (bucket.length > TOP_N) bucket.length = TOP_N;

    persist(data);
    return { added, rank };
  }

  function getLastNickname() {
    const data = load();
    return normalizeNickname(data.lastNickname);
  }

  function setLastNickname(name) {
    const data = load();
    data.lastNickname = normalizeNickname(name);
    persist(data);
  }

  function clear() {
    cache = {};
    try {
      storage.removeItem(LEADERBOARD_KEY);
    } catch {
      degraded = true;
    }
  }

  return {
    getScores,
    isTopTen,
    addScore,
    getLastNickname,
    setLastNickname,
    clear,
  };
}
