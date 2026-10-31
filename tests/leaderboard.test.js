// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { LEADERBOARD_KEY, TOP_N, LEADERBOARD_MODES, createLeaderboard } from '../src/core/leaderboard.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

describe('常量', () => {
  it('榜单键、TOP_N、模式列表', () => {
    expect(LEADERBOARD_KEY).toBe('minesweeper.leaderboard.v1');
    expect(TOP_N).toBe(10);
    expect(LEADERBOARD_MODES).toEqual(['beginner', 'intermediate', 'expert']);
  });
});

describe('基础存取', () => {
  let storage;
  beforeEach(() => {
    storage = memStorage();
  });

  it('空存储返回空数组', () => {
    const lb = createLeaderboard(storage);
    expect(lb.getScores('beginner', true)).toEqual([]);
    expect(lb.getScores('beginner', false)).toEqual([]);
  });

  it('加入成绩并按时间升序，返回排名', () => {
    const lb = createLeaderboard(storage);
    expect(lb.addScore('beginner', true, 'A', 3000).rank).toBe(1);
    expect(lb.addScore('beginner', true, 'B', 2000).rank).toBe(1);
    expect(lb.addScore('beginner', true, 'C', 4000).rank).toBe(3);
    expect(lb.addScore('beginner', true, 'D', 2500).rank).toBe(2);
    expect(lb.getScores('beginner', true).map((s) => s.nickname)).toEqual(['B', 'D', 'A', 'C']);
  });

  it('超出 10 条时截断，慢成绩不再加入', () => {
    const lb = createLeaderboard(storage);
    for (let i = 1; i <= 12; i++) lb.addScore('beginner', true, `玩家${i}`, 100000 + i * 1000);
    const scores = lb.getScores('beginner', true);
    expect(scores.length).toBe(10);
    expect(scores[0].timeMs).toBe(101000);
    expect(scores[9].timeMs).toBe(110000);
    expect(scores.find((s) => s.nickname === '玩家11')).toBeUndefined();
    const r = lb.addScore('beginner', true, '很慢', 999999999);
    expect(r.added).toBe(false);
    expect(r.rank).toBeUndefined();
  });

  it('相同 timeMs 时后写入排在后面', () => {
    const lb = createLeaderboard(storage);
    lb.addScore('expert', false, '甲', 1000);
    const r = lb.addScore('expert', false, '乙', 1000);
    expect(r.added).toBe(true);
    expect(r.rank).toBe(2);
    expect(lb.getScores('expert', false).map((s) => s.nickname)).toEqual(['甲', '乙']);
  });

  it('模式与防猜测开关之间隔离', () => {
    const lb = createLeaderboard(storage);
    lb.addScore('beginner', true, 'A', 1000);
    lb.addScore('beginner', false, 'B', 500);
    lb.addScore('expert', true, 'C', 300);
    expect(lb.getScores('beginner', true).map((s) => s.nickname)).toEqual(['A']);
    expect(lb.getScores('beginner', false).map((s) => s.nickname)).toEqual(['B']);
    expect(lb.getScores('expert', true).map((s) => s.nickname)).toEqual(['C']);
    expect(lb.getScores('expert', false)).toEqual([]);
  });

  it('跨实例持久化（同一 storage）', () => {
    let lb = createLeaderboard(storage);
    lb.addScore('intermediate', false, 'A', 1000);
    lb = createLeaderboard(storage);
    expect(lb.getScores('intermediate', false)[0].nickname).toBe('A');
  });
});

describe('isTopTen', () => {
  let storage;
  beforeEach(() => {
    storage = memStorage();
  });

  it('不足 10 条恒为 true', () => {
    const lb = createLeaderboard(storage);
    expect(lb.isTopTen('beginner', true, 999999999)).toBe(true);
  });

  it('满 10 条后仅更快为 true，同分后写无名次为 false', () => {
    const lb = createLeaderboard(storage);
    for (let i = 1; i <= 10; i++) lb.addScore('beginner', false, 'p', 100000 + i);
    expect(lb.isTopTen('beginner', false, 100000)).toBe(true);
    expect(lb.isTopTen('beginner', false, 100010)).toBe(false);
    expect(lb.isTopTen('beginner', false, 100011)).toBe(false);
  });
});

describe('健壮性', () => {
  it('损坏 JSON 自动修复为空', () => {
    const storage = memStorage();
    storage.setItem(LEADERBOARD_KEY, '{oops!');
    const lb = createLeaderboard(storage);
    expect(lb.getScores('beginner', true)).toEqual([]);
    lb.addScore('beginner', true, 'A', 1000);
    expect(lb.getScores('beginner', true).length).toBe(1);
  });

  it('存储抛错时优雅降级（内存可用，不崩溃）', () => {
    const broken = {
      getItem() { throw new Error('boom'); },
      setItem() { throw new Error('boom'); },
      removeItem() { throw new Error('boom'); },
    };
    const lb = createLeaderboard(broken);
    expect(() => lb.getScores('beginner', true)).not.toThrow();
    const r = lb.addScore('beginner', true, 'A', 1000);
    expect(r.added).toBe(true);
    expect(() => lb.getLastNickname()).not.toThrow();
  });

  it('昵称记忆默认值与截断 16 字符', () => {
    const lb = createLeaderboard(memStorage());
    expect(lb.getLastNickname()).toBe('玩家');
    lb.setLastNickname('A'.repeat(30));
    expect(lb.getLastNickname().length).toBe(16);
    lb.setLastNickname('张三');
    expect(lb.getLastNickname()).toBe('张三');
  });

  it('clear 清空全部', () => {
    const storage = memStorage();
    const lb = createLeaderboard(storage);
    lb.addScore('beginner', true, 'A', 1000);
    lb.setLastNickname('X');
    lb.clear();
    expect(lb.getScores('beginner', true)).toEqual([]);
  });
});
