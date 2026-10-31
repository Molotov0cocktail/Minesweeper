import { describe,it,expect } from 'vitest';
import { deduce,generateAntiGuessAdvanced,MAX_TOTAL_DEDUCE } from '../src/core/solve.js';
// 独立NSS/SNS契约预言机：不import生产邻居/洪泛/子集代码，双向约束按有序对枚举。
function oracle(rows,cols,mines,start){
 const total=rows*cols,near=i=>Array.from({length:total},(_,j)=>j).filter(j=>j!==i&&Math.abs(Math.floor(j/cols)-Math.floor(i/cols))<=1&&Math.abs(j%cols-i%cols)<=1);
 const counts=Array.from({length:total},(_,i)=>near(i).filter(j=>mines.has(j)).length),open=new Set(),flags=new Set();
 const flood=i=>{const q=[i];while(q.length){const n=q.pop();if(open.has(n)||flags.has(n))continue;if(mines.has(n))throw new Error('预言机推理错误：翻到雷');open.add(n);if(!counts[n])q.push(...near(n));}};
 flood(start);let changed=true;
 while(changed){
  const before=open.size+flags.size;
  const rules=[...open].map(i=>({cells:near(i).filter(j=>!open.has(j)&&!flags.has(j)),need:counts[i]-near(i).filter(j=>flags.has(j)).length})).filter(r=>r.cells.length);
  for(const r of rules){if(r.need===0)r.cells.forEach(flood);else if(r.need===r.cells.length)r.cells.forEach(j=>flags.add(j));}
  for(const a of rules)for(const b of rules){if(a.cells.length>=b.cells.length||!a.cells.every(j=>b.cells.includes(j)))continue;const diff=b.cells.filter(j=>!a.cells.includes(j));if(a.need===b.need)diff.forEach(flood);else if(b.need-a.need===diff.length)diff.forEach(j=>flags.add(j));}
  changed=open.size+flags.size>before;
 }
 return {solved:open.size===total-mines.size,unknown:Array.from({length:total},(_,i)=>i).filter(i=>!open.has(i)&&!flags.has(i))};
}
const sorted=s=>[...s].sort((a,b)=>a-b);
describe('求解几何对称与独立预言机',()=>{
 it('镜像可解布局不能因扫描顺序退化：{4,2,5}从中心无需重排',()=>{
  const mines=new Set([4,2,5]);expect(oracle(5,5,mines,12).solved).toBe(true);
  expect(deduce(5,5,mines,12).solved).toBe(true);
 });
 it('5×5安全边缘所有三雷布局，与双向推理预言机一致',()=>{
  const pool=[0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24];
  for(let a=0;a<pool.length;a++)for(let b=a+1;b<pool.length;b++)for(let c=b+1;c<pool.length;c++){
   const mines=new Set([pool[a],pool[b],pool[c]]),expected=oracle(5,5,mines,12),actual=deduce(5,5,mines,12);
   expect({solved:actual.solved,unknown:sorted(actual.unknown)},`雷位${sorted(mines)}`).toEqual(expected);
  }
 });
 it.each([[0,2,9],[0,2,19],[0,3,5],[0,3,14,23]])('镜像及旋转未知格对应一致 %j',(...layout)=>{
  const mines=new Set(layout),base=deduce(5,5,mines,12);
  for(const transform of [i=>Math.floor(i/5)*5+4-i%5,i=>(i%5)*5+4-Math.floor(i/5)]){
   const other=deduce(5,5,new Set(layout.map(transform)),12);
   expect(other.solved).toBe(base.solved);expect(sorted(other.unknown)).toEqual(sorted([...base.unknown].map(transform)));
  }
 });
 it.each([[0,5,new Set(),0],[61,5,new Set(),0],[5,Number.MAX_SAFE_INTEGER,new Set(),0],[5,5,new Set([25]),12],[5,5,new Set([12]),12],[5,5,new Set([1.5]),12],[5,5,new Set(),NaN],[5,5,null,12]])('非法布局安全返回',(...args)=>{
  expect(deduce(...args)).toEqual({solved:false,unknown:new Set(),clusters:[],smallest:null});
 });
 it('高级模式结果满足雷数、安全区、成功可解及预算封顶',()=>{
  for(let seed=1;seed<=12;seed++){
   let state=seed;const rng=()=>((state=(state*1664525+1013904223)>>>0)/4294967296);
   const r=generateAntiGuessAdvanced(9,9,10,40,{maxRegionAttempts:5,rng});
   expect(r.mineSet.size).toBe(10);for(const i of [30,31,32,39,40,41,48,49,50])expect(r.mineSet.has(i)).toBe(false);
   expect(r.attempts).toBeLessThanOrEqual(MAX_TOTAL_DEDUCE);if(r.ok)expect(deduce(9,9,r.mineSet,40).solved).toBe(true);
  }
 });
});
