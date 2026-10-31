import { describe, it, expect } from 'vitest';
import { createLeaderboard, LEADERBOARD_KEY } from '../src/core/leaderboard.js';
function storage(data) {
  const map = new Map([[LEADERBOARD_KEY, JSON.stringify(data)]]);
  return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };
}
describe('榜单数据完整性', () => {
  it('部分损坏仍保留合法记录，清洗昵称和日期', () => {
    const lb = createLeaderboard(storage({ beginner: { on: [null, {}, '坏记录', {nickname:'负数',timeMs:-1}, {nickname:'字符串',timeMs:'2'}, {nickname:3,timeMs:1}, {nickname:'  正常  ',timeMs:2000,date:'2026-10-31'}, {nickname:'',timeMs:1000,date:5}] } }));
    expect(lb.getScores('beginner', true)).toEqual([{nickname:'玩家',timeMs:1000,date:''}, {nickname:'正常',timeMs:2000,date:'2026-10-31'}]);
    expect(lb.addScore('beginner', true, '新增', 1500)).toEqual({added:true,rank:2});
  });
  it('返回条目不能篡改内存或之后持久化的数据', () => {
    const s = storage({}); const lb = createLeaderboard(s);
    lb.addScore('expert', false, '甲', 2000);
    lb.getScores('expert', false)[0].timeMs = -1;
    expect(lb.getScores('expert', false)[0].timeMs).toBe(2000);
    lb.addScore('expert', false, '乙', 3000);
    expect(createLeaderboard(s).getScores('expert', false)[0].timeMs).toBe(2000);
  });
  it.each([NaN, Infinity, -1, '100', undefined, null])('非法时间 %s 不污染成绩', time => {
    const lb = createLeaderboard(storage({}));
    expect(lb.isTopTen('beginner', true, time)).toBe(false);
    expect(lb.addScore('beginner', true, '玩家', time)).toEqual({added:false,rank:undefined});
    expect(lb.getScores('beginner', true)).toEqual([]);
  });
  it.each(['custom', '__proto__', 'constructor', 'toString'])('拒绝非标准模式 %s', mode => {
    const lb = createLeaderboard(storage({}));
    expect(lb.getScores(mode, true)).toEqual([]);
    expect(lb.isTopTen(mode, true, 1)).toBe(false);
    expect(lb.addScore(mode, true, '玩家', 1)).toEqual({added:false,rank:undefined});
    expect({}.on).toBeUndefined();
  });
  it('满榜同分后写排第11，不应邀请输入昵称', () => {
    const lb = createLeaderboard(storage({}));
    for(let i=1;i<=10;i++) lb.addScore('beginner', true, String(i), i*1000);
    expect(lb.isTopTen('beginner',true,10000)).toBe(false);
    expect(lb.isTopTen('beginner',true,9999)).toBe(true);
  });
  it('写入昵称遵循 trim/默认值/16字符，保持数据重载兼容', () => {
    const s=storage({}); const lb=createLeaderboard(s);
    lb.addScore('beginner',false,'  ',0);
    lb.addScore('beginner',false,'  abcdefghijklmnopq  ',1);
    lb.setLastNickname('  ');
    const reloaded=createLeaderboard(s);
    expect(reloaded.getScores('beginner',false).map(e=>e.nickname)).toEqual(['玩家','abcdefghijklmnop']);
    expect(reloaded.getLastNickname()).toBe('玩家');
  });
});
