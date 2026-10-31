// @vitest-environment node
// 严格测试：防猜测设置持久化（契约见 detailed-design §5b）
import { describe, it, expect, vi } from 'vitest';
import { createSettings, DEFAULT_SETTINGS, SETTINGS_KEY, LIMITS } from '../src/core/settings.js';

function makeStorage(initial = null) {
  let data = initial;
  return {
    getItem: vi.fn(() => data),
    setItem: vi.fn((_k, v) => { data = v; }),
    removeItem: vi.fn(() => { data = null; }),
  };
}

describe('默认值与常量', () => {
  it('DEFAULT_SETTINGS / SETTINGS_KEY / LIMITS 常量', () => {
    expect(SETTINGS_KEY).toBe('minesweeper.settings.v1');
    expect(DEFAULT_SETTINGS).toEqual({
      antiGuess: true,
      antiGuessMethod: 'advanced',
      maxAttempts: 20,
      maxRegionAttempts: 20,
      gamepadBindings: { reveal:0, mark:1, menu:2, pause:9, restart:3, focus:11, help:8 },
      focusView: false,
    });
    expect(LIMITS.maxAttempts).toEqual([1, 200]);
    expect(LIMITS.maxRegionAttempts).toEqual([1, 200]);
  });

  it('空存储 → get() 全默认值', () => {
    const s = createSettings(makeStorage(null));
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('get() 返回拷贝（修改返回值不影响内部）', () => {
    const s = createSettings(makeStorage());
    const a = s.get();
    a.maxAttempts = 99;
    expect(s.get().maxAttempts).toBe(20);
  });
});

describe('损坏存储恢复', () => {
  it('损坏 JSON → 全默认', () => {
    const s = createSettings(makeStorage('{{{not json'));
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('非对象（数组/字符串/数字）→ 全默认', () => {
    expect(createSettings(makeStorage('[1,2]')).get()).toEqual(DEFAULT_SETTINGS);
    expect(createSettings(makeStorage('"str"')).get()).toEqual(DEFAULT_SETTINGS);
    expect(createSettings(makeStorage('42')).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('字段类型错 → 逐字段回退默认', () => {
    const s = createSettings(makeStorage(JSON.stringify({
      antiGuess: 'yes', antiGuessMethod: 'magic',
      maxAttempts: '20', maxRegionAttempts: 3.5,
    })));
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('越界整数（0/500/-3）→ 回退默认', () => {
    const s = createSettings(makeStorage(JSON.stringify({ maxAttempts: 0, maxRegionAttempts: 500 })));
    expect(s.get().maxAttempts).toBe(20);
    expect(s.get().maxRegionAttempts).toBe(20);
    const s2 = createSettings(makeStorage(JSON.stringify({ maxAttempts: -3, maxRegionAttempts: 201 })));
    expect(s2.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('部分合法部分非法 → 合法生效非法回退', () => {
    const s = createSettings(makeStorage(JSON.stringify({
      antiGuess: false, antiGuessMethod: 'advanced', maxAttempts: 500, maxRegionAttempts: 7,
    })));
    const v = s.get();
    expect(v.antiGuess).toBe(false);
    expect(v.antiGuessMethod).toBe('advanced');
    expect(v.maxAttempts).toBe(20); // 越界回退
    expect(v.maxRegionAttempts).toBe(7);
  });
});

describe('update 语义', () => {
  it('update 合法字段生效并持久化，返回新拷贝', () => {
    const storage = makeStorage();
    const s = createSettings(storage);
    const next = s.update({ maxAttempts: 50, antiGuessMethod: 'advanced' });
    expect(next.maxAttempts).toBe(50);
    expect(next.antiGuessMethod).toBe('advanced');
    expect(storage.setItem).toHaveBeenCalledWith(SETTINGS_KEY, expect.stringContaining('"maxAttempts":50'));
    expect(s.get().maxAttempts).toBe(50); // 持久化后仍可取
  });

  it('update 非法字段被忽略（保留现值）', () => {
    const storage = makeStorage();
    const s = createSettings(storage);
    s.update({ maxAttempts: 30 });
    const next = s.update({ maxAttempts: 999, antiGuessMethod: 'hack', maxRegionAttempts: 5 });
    expect(next.maxAttempts).toBe(30);
    expect(next.antiGuessMethod).toBe('advanced');
    expect(next.maxRegionAttempts).toBe(5);
  });

  it('update 无合法字段 → 返回当前拷贝且不写存储', () => {
    const storage = makeStorage();
    const s = createSettings(storage);
    const next = s.update({ maxAttempts: 9999 });
    expect(next).toEqual(DEFAULT_SETTINGS);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('reset 恢复默认并持久化', () => {
    const storage = makeStorage();
    const s = createSettings(storage);
    s.update({ maxAttempts: 77, antiGuess: false });
    const next = s.reset();
    expect(next).toEqual(DEFAULT_SETTINGS);
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
    expect(storage.setItem).toHaveBeenLastCalledWith(SETTINGS_KEY, expect.stringContaining('"antiGuess":true'));
  });
});

describe('storage 异常降级', () => {
  it('getItem 抛错 → 降级默认不崩溃', () => {
    const bad = { getItem: vi.fn(() => { throw new Error('denied'); }), setItem: vi.fn(), removeItem: vi.fn() };
    const s = createSettings(bad);
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('setItem 抛错 → update 仍返回新值不崩溃', () => {
    const bad = { getItem: vi.fn(() => null), setItem: vi.fn(() => { throw new Error('quota'); }), removeItem: vi.fn() };
    const s = createSettings(bad);
    const next = s.update({ maxAttempts: 66 });
    expect(next.maxAttempts).toBe(66);
  });
});

it('旧standard偏好迁移为advanced且保留开关/预算/手柄，不能再设回standard',()=>{
  const storage=makeStorage(JSON.stringify({antiGuess:false,antiGuessMethod:'standard',maxAttempts:37,maxRegionAttempts:8,focusView:true}));
  const s=createSettings(storage);
  expect(s.get()).toMatchObject({antiGuess:false,antiGuessMethod:'advanced',maxAttempts:37,maxRegionAttempts:8,focusView:true});
  expect(s.update({antiGuessMethod:'standard'}).antiGuessMethod).toBe('advanced');
  s.update({maxRegionAttempts:9});expect(JSON.parse(storage.setItem.mock.calls.at(-1)[1]).antiGuessMethod).toBe('advanced');
});
