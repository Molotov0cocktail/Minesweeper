import {it,expect} from 'vitest';
import {createSettings,SETTINGS_KEY} from '../src/core/settings.js';
import {DEFAULT_GAMEPAD_BINDINGS as D} from '../src/core/gamepad.js';
function storage(value){let raw=JSON.stringify(value);return {getItem:()=>raw,setItem:(k,v)=>{raw=v;},removeItem:()=>{raw=null;}};}
it('旧防猜测档案补新字段，保留原设置',()=>{
 const s=createSettings(storage({antiGuess:false,maxAttempts:71}));expect(s.get()).toMatchObject({antiGuess:false,maxAttempts:71,focusView:false,gamepadBindings:D});
});
it('键位/专注持久化重载，map及默认常量不被返回值污染',()=>{
 const target=storage({}),s=createSettings(target),bindings={...D,mark:4};
 const returned=s.update({gamepadBindings:bindings,focusView:true});bindings.mark=7;returned.gamepadBindings.mark=6;
 const snapshot=s.get();snapshot.gamepadBindings.mark=5;
 expect(s.get().gamepadBindings.mark).toBe(4);expect(createSettings(target).get()).toMatchObject({focusView:true,gamepadBindings:{...D,mark:4}});
 expect(D.mark).toBe(1);expect(s.reset().gamepadBindings).toEqual(D);
});
it('坏键位整组默认；非法update保持现有值',()=>{
 const s=createSettings(storage({gamepadBindings:{...D,mark:0},focusView:'true'}));expect(s.get()).toMatchObject({gamepadBindings:D,focusView:false});
 s.update({gamepadBindings:{...D,mark:4},focusView:true});s.update({gamepadBindings:{mark:2},focusView:1});
 expect(s.get()).toMatchObject({gamepadBindings:{...D,mark:4},focusView:true});
});
it('返回深复制且storage异常仍可配置',()=>{
 const s=createSettings({getItem:()=>{throw Error('不可读');},setItem:()=>{throw Error('不可写');}});
 const a=s.update({gamepadBindings:{...D,mark:5},focusView:true});a.gamepadBindings.mark=0;
 expect(s.get()).toMatchObject({gamepadBindings:{...D,mark:5},focusView:true});
});
