import { describe, it, expect } from 'vitest';
import { inferForced } from '../src/core/constraints.js';

// 独立真值表：不复用生产搜索/剪枝代码。
function oracle(rules) {
  const cells = [...new Set(rules.flatMap(r => r.cells))];
  const layouts = [];
  for (let mask = 0; mask < 2 ** cells.length; mask++) {
    const layout = new Set(cells.filter((_, k) => mask & 2 ** k));
    if (rules.every(r => r.cells.filter(c => layout.has(c)).length === r.mines)) layouts.push(layout);
  }
  return {
    safe: new Set(cells.filter(c => layouts.length && layouts.every(s => !s.has(c)))),
    mines: new Set(cells.filter(c => layouts.length && layouts.every(s => s.has(c)))),
  };
}

describe('有界确定性约束推理', () => {
  it('非子集的三约束确定安全及雷，不能停留在两集合子集规则', () => {
    const rules = [{cells:[0,1],mines:1},{cells:[1,2],mines:1},{cells:[0,2,3],mines:1}];
    const before = JSON.stringify(rules);
    expect(inferForced(rules)).toMatchObject({safe:new Set([0,2]),mines:new Set([1,3]),complete:true});
    expect(JSON.stringify(rules)).toBe(before);
  });
  it('真实50/50不作确定性结论，独立分量仍可推理', () => {
    expect(inferForced([{cells:[0,1],mines:1},{cells:[9],mines:0}])).toMatchObject({safe:new Set([9]),mines:new Set(),complete:true});
  });
  it('节点预算中断不能把已搜索的少量样本误当确定结论', () => {
    const r = inferForced([{cells:[0,1,2,3,4,5],mines:3}], {maxNodes:3});
    expect(r.safe.size+r.mines.size).toBe(0);expect(r.complete).toBe(false);expect(r.nodes).toBeLessThanOrEqual(3);
  });
  it('变量预算按分量生效，大分量截断不影响独立小分量', () => {
    expect(inferForced([{cells:[0,1,2],mines:1},{cells:[9],mines:1}],{maxVariables:2})).toMatchObject({safe:new Set(),mines:new Set([9]),complete:false});
  });
  it('无解不产生虚假的确定性结论', () => {
    const r = inferForced([{cells:[0],mines:0},{cells:[0],mines:1}]);
    expect(r.safe.size+r.mines.size).toBe(0);
  });
  it.each([null,[{cells:[0],mines:2}],[{cells:[-1],mines:0}],[{cells:[0,0],mines:1}]])('非法约束安全返回 %j', rules => {
    expect(() => inferForced(rules)).not.toThrow();
    const r=inferForced(rules);expect(r.safe.size+r.mines.size).toBe(0);
  });
  it('200组确定性随机约束与完整真值表逐格一致', () => {
    let seed=8327;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    for(let k=0;k<200;k++){
      const n=3+k%5, layout=Array.from({length:n},()=>rng()<0.4);
      const rules=Array.from({length:2+k%6},()=>{
        const cells=Array.from({length:n},(_,i)=>i).filter(()=>rng()<0.6);
        return {cells,mines:cells.filter(i=>layout[i]).length};
      }).filter(r=>r.cells.length);
      const expected=oracle(rules), actual=inferForced(rules);
      expect(actual.safe,JSON.stringify(rules)).toEqual(expected.safe);expect(actual.mines).toEqual(expected.mines);expect(actual.complete).toBe(true);
    }
  });
});
