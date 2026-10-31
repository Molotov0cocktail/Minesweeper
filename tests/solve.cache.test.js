import {it,expect,vi} from 'vitest';
vi.mock('../src/core/board.js',async original=>({...await original(),randomMineSet:vi.fn(()=>new Set([0,3,14,23]))}));
import {generateAntiGuessAdvanced,MAX_TOTAL_DEDUCE} from '../src/core/solve.js';
it('重复局部布局复用推理，尝试预算有限而不反复求解相同布局',()=>{
 const r=generateAntiGuessAdvanced(5,5,4,12,{maxRegionAttempts:1000,rng:()=>0.5});
 expect(r.cacheHits).toBeGreaterThan(0);expect(r.attempts).toBeLessThan(MAX_TOTAL_DEDUCE);
 expect(r.mineSet.size).toBe(4);for(const i of [6,7,8,11,12,13,16,17,18])expect(r.mineSet.has(i)).toBe(false);
});
