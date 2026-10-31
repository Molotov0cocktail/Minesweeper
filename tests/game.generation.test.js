import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/core/board.js',async original=>({...await original(),randomMineSet:vi.fn(()=>new Set([0,2,3]))}));
import {createGame,STATE} from '../src/core/game.js';
const cfg={rows:5,cols:5,mines:3,mode:'custom',antiGuess:true};
const result={mineSet:[0,2,3],antiGuessActive:true,warning:null,stats:{attempts:2}};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
describe('异步首点生成',()=>{
 it('生成期间不计时/不接受棋盘操作，完成后翻首点并开始计时',async()=>{
  let now=0;const d=deferred(),prepareBoard=vi.fn(()=>d.promise),g=createGame(cfg,{prepareBoard,now:()=>now}),generated=vi.fn();g.on('generated',generated);
  expect(STATE.GENERATING).toBe('generating');expect(g.reveal(2,2)).toEqual({type:'generating'});await flush();
  expect(g.state).toBe('generating');expect(prepareBoard).toHaveBeenCalledWith(expect.objectContaining(cfg),12);
  now=5000;expect(g.getElapsedMs()).toBe(0);expect(g.board.minesPlaced).toBe(false);
  expect(g.reveal(0,0)).toEqual({type:'noop'});expect(g.cycleMark(0,0)).toEqual({type:'noop'});
  d.resolve(result);await flush();expect(g.state).toBe('playing');expect(g.antiGuessActive).toBe(true);expect(g.board.cells[12].state).toBe('revealed');
  expect(g.getElapsedMs()).toBe(0);now=6000;expect(g.getElapsedMs()).toBe(1000);expect(generated).toHaveBeenCalledTimes(1);
 });
 it('首点标记不启动Worker，取消/重开后晚到结果不生效',async()=>{
  const d=deferred(),prepareBoard=vi.fn(()=>d.promise),g=createGame(cfg,{prepareBoard});
  g.cycleMark(2,2);expect(g.reveal(2,2)).toEqual({type:'noop'});expect(prepareBoard).not.toHaveBeenCalled();
  g.reveal(1,1);g.cancelGeneration();expect(g.state).toBe('ready');g.restart();d.resolve(result);await flush();
  expect(g.state).toBe('ready');expect(g.board.minesPlaced).toBe(false);expect(g.board.revealedCount).toBe(0);
 });
 it('旧请求不能覆盖重开后的新请求',async()=>{
  const a=deferred(),b=deferred(),prepareBoard=vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise),g=createGame(cfg,{prepareBoard});
  g.reveal(2,2);await flush();g.restart();g.reveal(2,2);await flush();b.resolve(result);await flush();const board=structuredClone(g.board);
  a.resolve({...result,mineSet:[20,22,24]});await flush();expect(g.board).toEqual(board);
 });
 it.each([null,{...result,mineSet:[0,0,2]},{...result,mineSet:[0,2,12]},{...result,mineSet:[0,2,25]},{...result,mineSet:[0,2,1.5]}])('非法Worker布局回退普通开局，不崩溃/不冒充无猜',async invalid=>{
  const g=createGame(cfg,{prepareBoard:()=>Promise.resolve(invalid)});g.reveal(2,2);await flush();
  expect(g.state).toBe('playing');expect(g.antiGuessActive).toBe(false);expect(g.warning).toBe('防猜测已关闭：生成超时或失败，已切换普通开局');
  expect(g.board.cells.filter(c=>c.isMine).map(c=>c.idx)).toEqual([0,2,3]);
 });
 it('拒绝/超时回退并发警告；取消请求的拒绝不回退',async()=>{
  const warning=vi.fn(),g=createGame(cfg,{prepareBoard:()=>Promise.reject(new Error('生成超时'))});g.on('warning',warning);g.reveal(2,2);await flush();
  expect(warning).toHaveBeenCalledTimes(1);expect(g.antiGuessActive).toBe(false);
  const d=deferred(),cancelled=createGame(cfg,{prepareBoard:()=>d.promise});cancelled.reveal(2,2);cancelled.cancelGeneration();d.reject(new Error('生成已取消'));await flush();expect(cancelled.state).toBe('ready');expect(cancelled.warning).toBeNull();
 });
 it('防猜关闭时保持同步，不调用生成器',()=>{
  const prepareBoard=vi.fn(),g=createGame({...cfg,antiGuess:false},{prepareBoard});expect(g.reveal(2,2).type).toBe('reveal');expect(prepareBoard).not.toHaveBeenCalled();
 });
});
