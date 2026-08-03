// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { MODES, CUSTOM_RANGE, CUSTOM_MAX_DENSITY, validateCustom } from '../src/core/modes.js';

describe('MODES 标准模式常量', () => {
  it('三种标准模式参数正确', () => {
    expect(MODES.beginner).toEqual({ key: 'beginner', name: '初级', rows: 9, cols: 9, mines: 10 });
    expect(MODES.intermediate).toEqual({ key: 'intermediate', name: '中级', rows: 16, cols: 16, mines: 40 });
    expect(MODES.expert).toEqual({ key: 'expert', name: '高级', rows: 16, cols: 30, mines: 99 });
  });
});

describe('自定义参数范围常量', () => {
  it('行列范围与密度上限', () => {
    expect(CUSTOM_RANGE).toEqual({ min: 5, max: 60 });
    expect(CUSTOM_MAX_DENSITY).toBe(0.8);
  });
});

describe('validateCustom', () => {
  it('合法输入通过并规范化为整数', () => {
    expect(validateCustom('9', 9, '10')).toEqual({ ok: true, rows: 9, cols: 9, mines: 10 });
    expect(validateCustom(5, 60, 1)).toEqual({ ok: true, rows: 5, cols: 60, mines: 1 });
  });

  it('行数低于范围失败', () => {
    expect(validateCustom(4, 9, 10).ok).toBe(false);
  });

  it('列数高于范围失败', () => {
    expect(validateCustom(9, 61, 10).ok).toBe(false);
  });

  it('雷数小于 1 失败', () => {
    expect(validateCustom(9, 9, 0).ok).toBe(false);
  });

  it('雷数超过 0.8 密度上限失败', () => {
    // 9x9=81, floor(81*0.8)=64, 且 81-9=72 → 上限 64；65 失败
    expect(validateCustom(9, 9, 65).ok).toBe(false);
  });

  it('雷数超过 total-9（安全区）失败', () => {
    // 5x5=25, floor(25*0.8)=20, 25-9=16 → 上限 16；17 失败
    expect(validateCustom(5, 5, 17).ok).toBe(false);
  });

  it('边界合法值通过', () => {
    expect(validateCustom(5, 5, 16).ok).toBe(true);   // = total-9 边界
    expect(validateCustom(9, 9, 64).ok).toBe(true);   // = 0.8 密度边界
    expect(validateCustom(60, 60, 1).ok).toBe(true);  // 最小雷数 + 最大棋盘
  });

  it('非数字输入失败', () => {
    expect(validateCustom('abc', 9, 10).ok).toBe(false);
    expect(validateCustom(NaN, 9, 10).ok).toBe(false);
    expect(validateCustom(undefined, 9, 10).ok).toBe(false);
    expect(validateCustom(9, null, 10).ok).toBe(false);
  });

  it('浮点输入失败', () => {
    expect(validateCustom(9.5, 9, 10).ok).toBe(false);
    expect(validateCustom(9, 9, 3.7).ok).toBe(false);
  });

  it('失败时错误信息为可读中文', () => {
    const r = validateCustom(4, 9, 10);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(/[一-龥]/.test(r.error)).toBe(true);
  });
});
