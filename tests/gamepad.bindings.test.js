import {it,expect} from 'vitest';
import {DEFAULT_GAMEPAD_BINDINGS as D,isValidGamepadBindings,rebindGamepad,createGamepadMapper} from '../src/core/gamepad.js';
const pad=pressed=>({id:'测试',index:0,mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:16},(_,i)=>({pressed:pressed.includes(i)}))});
it('7个完整默认键位：B标雷、X菜单、R3专注，默认常量冻结',()=>{
 expect(D).toEqual({reveal:0,mark:1,menu:2,pause:9,restart:3,focus:11,help:8});expect(Object.isFrozen(D)).toBe(true);expect(isValidGamepadBindings(D)).toBe(true);
});
it.each([null,{}, {...{reveal:0,mark:1,menu:2,pause:9,restart:3,focus:11,help:8},mark:0}, {reveal:0,mark:12,menu:2,pause:9,restart:3,focus:11,help:8}, {reveal:0,mark:1.5,menu:2,pause:9,restart:3,focus:11,help:8}, {reveal:0,mark:1,menu:2,pause:9,restart:3,focus:11,help:8,extra:5}])('非法配置拒绝 %j',map=>{expect(isValidGamepadBindings(map)).toBe(false);});
it('占用键互换，源map及冻结默认不被修改',()=>{
 const result=rebindGamepad(D,'mark',2);expect(result).toEqual({...D,mark:2,menu:1});expect(D.mark).toBe(1);expect(result).not.toBe(D);
 for(const args of [['oops',4],['mark',15],['mark',NaN]])expect(rebindGamepad(D,...args)).toEqual(D);
});
it('动态改变按键后必须松开才生效，旧B不再标记',()=>{
 const m=createGamepadMapper();m.poll([pad([])],0);expect(m.poll([pad([1])],1).actions).toEqual(['mark']);
 m.setBindings({...D,mark:4});expect(m.poll([pad([4])],2).actions).toEqual([]);
 m.poll([pad([])],3);expect(m.poll([pad([4])],4).actions).toEqual(['mark']);
 m.poll([pad([])],5);expect(m.poll([pad([1])],6).actions).toEqual([]);
});
it('相同map不反复重锁，重开的自定义键仍需800ms',()=>{
 const map={...D,restart:7},m=createGamepadMapper({bindings:map});m.poll([pad([])],0);m.setBindings({...map});
 expect(m.poll([pad([7])],1).actions).toEqual([]);m.setBindings({...map});expect(m.poll([pad([7])],801).actions).toEqual(['restart']);
});
