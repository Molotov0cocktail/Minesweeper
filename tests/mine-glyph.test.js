import {it,expect} from 'vitest';
import {drawMineGlyph} from '../src/renderer/mine-glyph.js';
import {drawCell} from '../src/renderer/render.js';
function recorder(gradient=true){
 const calls=[],stack=[],ctx={fillStyle:'#111',strokeStyle:'#222',lineWidth:7,lineCap:'butt',
  save(){stack.push({fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,lineCap:this.lineCap});calls.push(['save']);},restore(){Object.assign(this,stack.pop());calls.push(['restore']);},
  beginPath(){calls.push(['begin']);},moveTo(x,y){calls.push(['move',x,y]);},lineTo(x,y){calls.push(['line',x,y,this.lineWidth]);},
  arc(x,y,r,a,b){calls.push(['arc',x,y,r,a,b]);},fill(){calls.push(['fill',this.fillStyle]);},stroke(){calls.push(['stroke',this.strokeStyle]);},fillRect(x,y,w,h){calls.push(['rect',x,y,w,h,this.fillStyle]);},fillText(t,x,y){calls.push(['text',t,x,y]);},
 };
 if(gradient)ctx.createRadialGradient=(...args)=>{const value={stops:[],addColorStop(at,color){this.stops.push([at,color]);}};calls.push(['gradient',...args]);return value;};
 return {ctx,calls,stack};
}
it.each([16,20,24,32,48,96])('%spx地雷有八向短刺、球体和高光，所有几何位于格内安全区',size=>{
 const {ctx,calls,stack}=recorder();drawMineGlyph(ctx,10,20,size);
 expect(calls.filter(c=>c[0]==='line')).toHaveLength(8);
 expect(calls.filter(c=>c[0]==='arc').length).toBeGreaterThanOrEqual(2);
 expect(new Set(calls.filter(c=>c[0]==='fill'||c[0]==='stroke').map(c=>JSON.stringify(c[1]))).size).toBeGreaterThanOrEqual(3);
 for(const c of calls){if(c[0]==='move'||c[0]==='line'){expect(c[1]).toBeGreaterThanOrEqual(10+size*.1);expect(c[1]).toBeLessThanOrEqual(10+size*.9);expect(c[2]).toBeGreaterThanOrEqual(20+size*.1);expect(c[2]).toBeLessThanOrEqual(20+size*.9);}if(c[0]==='arc'){expect(c[1]-c[3]).toBeGreaterThanOrEqual(10+size*.1);expect(c[1]+c[3]).toBeLessThanOrEqual(10+size*.9);expect(c[2]-c[3]).toBeGreaterThanOrEqual(20+size*.1);expect(c[2]+c[3]).toBeLessThanOrEqual(20+size*.9);}}
 expect(ctx).toMatchObject({fillStyle:'#111',strokeStyle:'#222',lineWidth:7,lineCap:'butt'});expect(stack).toHaveLength(0);
});
it('无渐变上下文可降级，颜色覆盖与失败警戒不会抹掉主体',()=>{
 for(const lost of [false,true]){const {ctx,calls}=recorder(false);drawMineGlyph(ctx,0,0,24,{color:'#123456',highlight:'#eeffdd',danger:'#a01010',lost});const paint=JSON.stringify(calls);expect(paint).toContain('#123456');expect(paint).toContain('#eeffdd');expect(paint.includes('#a01010')).toBe(lost);}
});
it.each([[0,0,0],[0,0,-1],[NaN,0,24],[0,Infinity,24],[0,0,Infinity]])('非法图元参数安全空绘制 %j',(...args)=>{const {ctx,calls}=recorder();expect(()=>drawMineGlyph(ctx,...args)).not.toThrow();expect(calls).toEqual([]);});
it('未开/标旗/问号格完全不泄露雷图；翻开雷使用新图元且保持colors覆盖',()=>{
 for(const state of ['hidden','flagged','questioned']){const a=recorder(),b=recorder();drawCell(a.ctx,0,0,24,{state,isMine:true,count:0},'playing');drawCell(b.ctx,0,0,24,{state,isMine:false,count:0},'playing');expect(a.calls).toEqual(b.calls);expect(a.calls.some(c=>c[0]==='arc')).toBe(false);}
 const {ctx,calls}=recorder();drawCell(ctx,0,0,24,{state:'revealed',isMine:true,count:0},'lost',{colors:{mine:'#123456',highlight:'#a01010'}});
 expect(calls.filter(c=>c[0]==='save')).toHaveLength(1);expect(JSON.stringify(calls)).toContain('#123456');expect(JSON.stringify(calls)).toContain('#a01010');
});
