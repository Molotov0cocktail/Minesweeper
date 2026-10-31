import { describe,it,expect } from 'vitest';
import { createGamepadMapper } from '../src/core/gamepad.js';
const pad=(pressed=[],axes=[0,0],more={})=>({id:'测试手柄',index:0,mapping:'standard',connected:true,axes,buttons:Array.from({length:16},(_,i)=>({pressed:pressed.includes(i),value:pressed.includes(i)?1:0})),...more});
function armed(){const m=createGamepadMapper();m.poll([pad()],0);return m;}
describe('标准手柄映射',()=>{
 it.each([[0,'reveal'],[1,'mark'],[2,'menu'],[8,'help'],[11,'focus'],[9,'pause'],[12,'up'],[13,'down'],[14,'left'],[15,'right']])('%s按键对应%s，仅按下边沿触发',(button,action)=>{
  const m=armed();expect(m.poll([pad([button])],1).actions).toEqual([action]);
  expect(m.poll([pad([button])],2).actions).toEqual([]);
  m.poll([pad()],3);expect(m.poll([pad([button])],4).actions).toEqual([action]);
 });
 it('连接时已有按住的翻格键必须先松开，不意外开局',()=>{
  const m=createGamepadMapper();expect(m.poll([pad([0])],0).actions).toEqual([]);
  expect(m.poll([pad([0])],50).actions).toEqual([]);
  m.poll([pad()],51);expect(m.poll([pad([0])],52).actions).toEqual(['reveal']);
 });
 it('死区、主轴与十字键优先，方向300/100ms连发不积压',()=>{
  const m=armed();expect(m.poll([pad([],[.35,-.35])],1).actions).toEqual([]);
  expect(m.poll([pad([],[.8,.6])],2).actions).toEqual(['right']);
  expect(m.poll([pad([],[.8,.6])],301).actions).toEqual([]);
  expect(m.poll([pad([],[.8,.6])],302).actions).toEqual(['right']);
  expect(m.poll([pad([],[.8,.6])],401).actions).toEqual([]);
  expect(m.poll([pad([],[.8,.6])],402).actions).toEqual(['right']);
  expect(m.poll([pad([12],[.8,.6])],403).actions).toEqual(['up']);
  expect(m.poll([pad([12])],10000).actions).toEqual(['up']);
 });
 it('长按Y800ms才重开，并只触发一次',()=>{
  const m=armed();expect(m.poll([pad([3])],10).actions).toEqual([]);
  expect(m.poll([pad([3])],809).actions).toEqual([]);
  expect(m.poll([pad([3])],810).actions).toEqual(['restart']);
  expect(m.poll([pad([3])],5000).actions).toEqual([]);
  m.poll([pad()],5001);m.poll([pad([3])],5002);
  expect(m.poll([pad([3])],5802).actions).toEqual(['restart']);
 });
 it('禁用和断连后重新武装；切换设备不会继承按住键',()=>{
  const m=armed();expect(m.poll([pad([0])],1,false).actions).toEqual([]);
  expect(m.poll([pad([0])],2,true).actions).toEqual([]);
  m.poll([pad()],3);expect(m.poll([pad([0])],4).actions).toEqual(['reveal']);
  expect(m.poll([],5).connected).toBe(false);
  expect(m.poll([pad([0])],6).actions).toEqual([]);
  m.poll([pad()],7);
  expect(m.poll([pad([2],[0,0],{id:'另一个手柄'})],8).actions).toEqual([]);
 });
 it('多设备选最低标准index，未映射设备不猜按键',()=>{
  const m=createGamepadMapper();
  expect(m.poll([pad([],[0,0],{index:5,id:'5'}),null,pad([],[0,0],{index:2,id:'2'})],0).id).toBe('2');
  const r=m.poll([pad([0],[0,0],{mapping:''})],1);
  expect(r).toMatchObject({connected:true,supported:false,actions:[]});
 });
 it('坏设备/非法轴/空数组安全返回',()=>{
  const m=armed();
  for(const value of [null,undefined,[],[null],[{}]]) expect(()=>m.poll(value,NaN)).not.toThrow();
  m.reset();m.poll([pad()],0);expect(m.poll([pad([],[NaN,Infinity])],2).actions).toEqual([]);
 });
});
