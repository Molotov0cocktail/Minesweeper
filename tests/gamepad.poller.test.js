import { it,expect,vi } from 'vitest';
import { startGamepad } from '../src/renderer/gamepad.js';
it('动态键位读取真正变化才重置中立锁，新键位可用',()=>{
 let frame,bindings={reveal:0,mark:1,menu:2,pause:9,restart:3,focus:11,help:8};const onAction=vi.fn();
 const p={id:'测试',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))};
 const stop=startGamepad({onAction,getBindings:()=>({...bindings}),getGamepads:()=>[p],requestFrame:cb=>{frame=cb;return 1;},cancelFrame:()=>{}});
 frame(0);p.buttons[1].pressed=true;frame(1);expect(onAction).toHaveBeenLastCalledWith('mark');
 bindings={...bindings,mark:4};p.buttons[4].pressed=true;frame(2);expect(onAction).toHaveBeenCalledTimes(1);
 p.buttons[1].pressed=false;p.buttons[4].pressed=false;frame(3);p.buttons[4].pressed=true;frame(4);expect(onAction).toHaveBeenCalledTimes(2);expect(onAction).toHaveBeenLastCalledWith('mark');stop();
});
it('逐帧读取、状态去重、禁用与API异常安全停止，stop幂等',()=>{
 let frame,id=0,enabled=true,pads=[];
 const onAction=vi.fn(),onStatus=vi.fn(),cancelFrame=vi.fn();
 const getGamepads=vi.fn(()=>pads),requestFrame=vi.fn(cb=>{frame=cb;return ++id;});
 const stop=startGamepad({onAction,onStatus,isEnabled:()=>enabled,getGamepads,requestFrame,cancelFrame});
 frame(0);frame(1);expect(onStatus).toHaveBeenCalledTimes(1);
 const p={id:'测试',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))};
 pads=[p];frame(2);expect(onStatus).toHaveBeenCalledTimes(2);
 p.buttons[0].pressed=true;frame(3);expect(onAction).toHaveBeenCalledWith('reveal');
 enabled=false;frame(4);enabled=true;frame(5);expect(onAction).toHaveBeenCalledTimes(1);
 getGamepads.mockImplementationOnce(()=>{throw new Error('访问不可用');});expect(()=>frame(6)).not.toThrow();
 const pending=id;stop();stop();expect(cancelFrame).toHaveBeenCalledTimes(1);expect(cancelFrame).toHaveBeenCalledWith(pending);
 const previous=getGamepads.mock.calls.length;frame(7);expect(getGamepads).toHaveBeenCalledTimes(previous);
});
