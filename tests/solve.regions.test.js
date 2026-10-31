import {it,expect} from 'vitest';
import {generateAntiGuessAdvanced,deduce,MAX_TOTAL_DEDUCE} from '../src/core/solve.js';
it('最小未知簇无雷时仍修复其它含雷簇，避免把尚可推进的布局当失败',()=>{
 let seed=20;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 const result=generateAntiGuessAdvanced(16,16,40,136,{maxRegionAttempts:20,rng});
 expect(result.ok).toBe(true);expect(result.mineSet.size).toBe(40);
 for(const i of [119,120,121,135,136,137,151,152,153])expect(result.mineSet.has(i)).toBe(false);
 expect(result.attempts).toBeLessThanOrEqual(MAX_TOTAL_DEDUCE);
 expect(deduce(16,16,result.mineSet,136).solved).toBe(true);
});
