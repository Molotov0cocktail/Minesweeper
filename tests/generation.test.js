import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest';
vi.mock('../src/core/solve.js',()=>({generateAntiGuess:vi.fn(),generateAntiGuessAdvanced:vi.fn()}));
vi.mock('../src/core/board.js',async original=>({...await original(),randomMineSet:vi.fn(()=>new Set([0,1,2]))}));
import {generateAntiGuess,generateAntiGuessAdvanced} from '../src/core/solve.js';
import {generateOpening} from '../src/renderer/generation-worker.js';
import {createGenerationClient,GENERATION_TIMEOUT_MS} from '../src/renderer/generation-client.js';
const config={rows:5,cols:5,mines:3,antiGuessMethod:'standard',maxAttempts:7,maxRegionAttempts:9};
beforeEach(()=>{vi.clearAllMocks();});
afterEach(()=>{vi.useRealTimers();});
describe('统一局部修复生成协议',()=>{
 it.each(['standard','advanced',undefined])('旧method=%s均采用局部修复，成功状态与Set序列化正确',method=>{
  generateAntiGuessAdvanced.mockReturnValue({ok:true,mineSet:new Set([0,2,3]),attempts:2});
  const r=generateOpening({...config,antiGuessMethod:method},12);
  expect(generateAntiGuessAdvanced).toHaveBeenCalledWith(5,5,3,12,{maxRegionAttempts:9});
  expect(generateAntiGuess).not.toHaveBeenCalled();
  expect(r).toMatchObject({mineSet:[0,2,3],antiGuessActive:true,warning:null});
 });
 it('局部预算耗尽保留布局并关闭，不再整盘重排',()=>{
  generateAntiGuessAdvanced.mockReturnValue({ok:false,reason:'region',mineSet:new Set([0,2,3]),attempts:20});
  expect(generateOpening(config,12)).toMatchObject({mineSet:[0,2,3],antiGuessActive:false,warning:'防猜测已关闭：局部修复预算耗尽，已切换普通开局'});
  expect(generateAntiGuess).not.toHaveBeenCalled();
 });
 it('密度高直接关闭，普通开局不调用任何求解器',()=>{
  generateAntiGuessAdvanced.mockReturnValue({ok:false,reason:'density',mineSet:null,attempts:0});
  expect(generateOpening(config,12)).toMatchObject({antiGuessActive:false,warning:'防猜测已关闭：雷密度过高，无法保证无猜',mineSet:[0,1,2]});
  vi.clearAllMocks();expect(generateOpening({...config,antiGuess:false},12).antiGuessActive).toBe(false);
  expect(generateAntiGuess).not.toHaveBeenCalled();expect(generateAntiGuessAdvanced).not.toHaveBeenCalled();
 });
});
class FakeWorker {
 listeners=new Map();postMessage=vi.fn();terminate=vi.fn();
 addEventListener(t,cb){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(cb);}
 removeEventListener(t,cb){this.listeners.get(t)?.delete(cb);}
 emit(t,data){for(const cb of this.listeners.get(t)||[])cb({data,preventDefault:()=>{}});}
 count(){return [...this.listeners.values()].reduce((n,s)=>n+s.size,0);}
}
function client(){const workers=[];const workerFactory=vi.fn(()=>{const w=new FakeWorker();workers.push(w);return w;});return {client:createGenerationClient({workerFactory}),workers,workerFactory};}
describe('Worker请求生命周期',()=>{
 it('成功结果只接收匹配id，结束清理Worker/监听/超时',async()=>{
  vi.useFakeTimers();const {client:c,workers}=client();const p=c.prepare(config,12),w=workers[0],request=w.postMessage.mock.calls[0][0];
  expect(request).toMatchObject({config,startIdx:12});w.emit('message',{id:request.id+1,result:{wrong:true}});expect(w.terminate).not.toHaveBeenCalled();
  const result={mineSet:[0,1,2],antiGuessActive:true};w.emit('message',{id:request.id,result});
  await expect(p).resolves.toEqual(result);expect(w.terminate).toHaveBeenCalledTimes(1);expect(w.count()).toBe(0);expect(vi.getTimerCount()).toBe(0);c.destroy();
 });
 it('新请求取消旧请求，晚到消息不污染新请求',async()=>{
  const {client:c,workers}=client();const p1=c.prepare(config,12);const rejection=expect(p1).rejects.toThrow('生成已取消');
  const p2=c.prepare(config,0);await rejection;expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  const r=workers[1].postMessage.mock.calls[0][0];workers[0].emit('message',{id:r.id,result:{stale:true}});
  workers[1].emit('message',{id:r.id,result:{mineSet:[10,20,24]}});await expect(p2).resolves.toEqual({mineSet:[10,20,24]});c.destroy();
 });
 it('8秒超时硬终止，不留下后台计算和定时器',async()=>{
  vi.useFakeTimers();expect(GENERATION_TIMEOUT_MS).toBe(8000);const {client:c,workers}=client();
  const p=c.prepare(config,12),rejection=expect(p).rejects.toThrow('生成超时');vi.advanceTimersByTime(8000);await rejection;
  expect(workers[0].terminate).toHaveBeenCalledTimes(1);expect(workers[0].count()).toBe(0);expect(vi.getTimerCount()).toBe(0);c.destroy();
 });
 it.each(['error','messageerror'])('%s拒绝并终止',async type=>{
  const {client:c,workers}=client();const p=c.prepare(config,12),rejection=expect(p).rejects.toBeInstanceOf(Error);
  workers[0].emit(type,{});await rejection;expect(workers[0].terminate).toHaveBeenCalledTimes(1);expect(workers[0].count()).toBe(0);c.destroy();
 });
 it('创建失败返回Promise拒绝，cancel/destroy重复安全',async()=>{
  const c=createGenerationClient({workerFactory:()=>{throw new Error('无法创建');}});
  await expect(c.prepare(config,12)).rejects.toBeInstanceOf(Error);expect(()=>{c.cancel();c.destroy();c.destroy();}).not.toThrow();
 });
 it('错误响应和非法结果不作为棋盘提交',async()=>{
  for(const data of [{error:'生成失败'},{result:null}]){
   const {client:c,workers}=client();const p=c.prepare(config,12),rejection=expect(p).rejects.toBeInstanceOf(Error);
   workers[0].emit('message',{id:workers[0].postMessage.mock.calls[0][0].id,...data});await rejection;expect(workers[0].terminate).toHaveBeenCalledTimes(1);c.destroy();
  }
 });
});
