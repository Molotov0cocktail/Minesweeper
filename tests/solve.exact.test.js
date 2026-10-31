import {it,expect} from 'vitest';
import {deduce} from '../src/core/solve.js';

// 独立真值表逐轮模拟，只从翻开数字构建约束，不调用生产邻居/约束/洪泛函数。
function oracle(rows,cols,mines,start){
 const n=rows*cols, near=i=>Array.from({length:n},(_,j)=>j).filter(j=>j!==i&&Math.abs(Math.floor(i/cols)-Math.floor(j/cols))<=1&&Math.abs(i%cols-j%cols)<=1);
 const counts=Array.from({length:n},(_,i)=>near(i).filter(j=>mines.has(j)).length),open=new Set(),flags=new Set();
 function flood(i){const q=[i];while(q.length){const j=q.pop();if(open.has(j)||flags.has(j))continue;expect(mines.has(j)).toBe(false);open.add(j);if(counts[j]===0)q.push(...near(j));}}
 flood(start);let changed=true;
 while(changed){
  changed=false;
  const unknown=Array.from({length:n},(_,i)=>i).filter(i=>!open.has(i)&&!flags.has(i));
  const rules=[...open].map(i=>({cells:near(i).filter(j=>unknown.includes(j)),need:counts[i]-near(i).filter(j=>flags.has(j)).length})).filter(r=>r.cells.length);
  for(const r of rules)if(r.need===0){for(const i of r.cells)if(!open.has(i)){flood(i);changed=true;}}else if(r.need===r.cells.length){for(const i of r.cells)if(!flags.has(i)){flags.add(i);changed=true;}}
  if(changed)continue;
  const cells=[...new Set(rules.flatMap(r=>r.cells))];expect(cells.length).toBeLessThanOrEqual(20);
  const positions=new Map(cells.map((c,k)=>[c,k])), sums=cells.map(()=>0);let solutions=0;
  for(let mask=0;mask<2**cells.length;mask++){
   if(!rules.every(r=>r.cells.reduce((s,c)=>s+((mask>>positions.get(c))&1),0)===r.need))continue;
   solutions++;cells.forEach((c,k)=>{sums[k]+=(mask>>k)&1;});
  }
  expect(solutions).toBeGreaterThan(0);
  for(let k=0;k<cells.length;k++)if(sums[k]===0){flood(cells[k]);changed=true;}else if(sums[k]===solutions){flags.add(cells[k]);changed=true;}
 }
 return {solved:open.size===n-mines.size,unknown:new Set(Array.from({length:n},(_,i)=>i).filter(i=>!open.has(i)&&!flags.has(i)))};
}

it('非子集组合推理可以解出旧规则停滞的6×6地图，并在镜像旋转后保持结论',()=>{
 const layout=[30,24,33,2,16,12], transforms=[i=>i,i=>Math.floor(i/6)*6+5-i%6,i=>(i%6)*6+5-Math.floor(i/6)];
 for(const transform of transforms){
  const mines=new Set(layout.map(transform)),start=transform(14);
  expect(oracle(6,6,mines,start)).toEqual({solved:true,unknown:new Set()});
  expect(deduce(6,6,mines,start)).toMatchObject({solved:true,unknown:new Set(),clusters:[],smallest:null});
 }
});

it('独立真值表证实局部进展fixture每一步的未知格，最终不靠移雷即可解',()=>{
 const layouts=[[[9,14,21,24],[4,9,19,20,21,23,24]],[[4,14,21,24],[20,21,23,24]],[[4,14,20,24],[]]];
 for(const [layout,unknown] of layouts)expect(oracle(5,5,new Set(layout),12)).toEqual({solved:unknown.length===0,unknown:new Set(unknown)});
});
it('独立真值表验证最小孤立未知安全格需等待另一含雷簇修复',()=>{
 expect(oracle(5,5,new Set([0,1,10,21]),12)).toEqual({solved:false,unknown:new Set([5,10,20])});
 expect(oracle(5,5,new Set([0,1,5,21]),12)).toEqual({solved:true,unknown:new Set()});
});
