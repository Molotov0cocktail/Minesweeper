// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('../src/renderer/render.js',()=>({drawBoard:vi.fn()}));
vi.mock('../src/core/game.js',async original=>{const actual=await original();return {...actual,createGame:vi.fn(actual.createGame)};});
vi.mock('../src/core/board.js',async original=>({...await original(),randomMineSet:vi.fn(()=>new Set([20,22,24,36,40,46,58,60,70,80]))}));
import {createGame} from '../src/core/game.js';
import {startApp} from '../src/renderer/main.js';
let app,controls,client,resolve,stop;
const $=id=>document.getElementById(id),game=()=>createGame.mock.results.at(-1).value;
const key=k=>$('board-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
beforeEach(()=>{
 controls=undefined;resolve=undefined;
 vi.useFakeTimers();vi.clearAllMocks();localStorage.clear();document.body.className='';
 document.body.innerHTML='<div id="app"><div id="board-wrap"><canvas id="board-canvas"></canvas><div id="scale-handle"></div></div></div>';
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({setTransform:vi.fn()});
 client={prepare:vi.fn(()=>new Promise(r=>{resolve=r;})),cancel:vi.fn(),destroy:vi.fn()};stop=vi.fn();
});
function boot(antiGuess=false){
 localStorage.setItem('minesweeper.settings.v1',JSON.stringify({antiGuess,antiGuessMethod:'standard',maxAttempts:20,maxRegionAttempts:20}));
 app=startApp({host:$('app'),storage:localStorage,generationClient:client,gamepadFactory:o=>{controls=o;return stop;}});
 expect(controls).toBeTruthy();
}
afterEach(()=>{app?.destroy();app=null;vi.restoreAllMocks();vi.useRealTimers();});
it('手柄移动与标记复用棋盘操作，Start暂停/A继续，输入框不操作',()=>{
 boot();controls.onStatus({connected:true,supported:true,id:'模拟手柄'});expect($('controller-status').textContent).toContain('模拟手柄');
 controls.onAction('right');controls.onAction('mark');expect(game().board.cells[1].state).toBe('flagged');expect(document.activeElement).toBe($('board-canvas'));
 $('custom-rows').focus();expect(controls.isEnabled()).toBe(false);controls.onAction('mark');expect(game().board.cells[1].state).toBe('flagged');
 $('board-canvas').focus();controls.onAction('down');controls.onAction('reveal');expect(game().state).toBe('playing');
 controls.onAction('pause');expect(game().state).toBe('paused');controls.onAction('reveal');expect(game().state).toBe('playing');
 controls.onAction('restart');expect(game().state).toBe('ready');
});
it('昵称弹窗A提交默认昵称/B取消；后台屏蔽手柄',()=>{
 boot();$('nickname-modal').classList.remove('hidden');$('nickname-input').focus();
 expect(controls.isEnabled()).toBe(true);controls.onAction('cancel');expect($('nickname-modal').classList.contains('hidden')).toBe(true);
 $('nickname-modal').classList.remove('hidden');$('nickname-input').focus();controls.onAction('reveal');expect($('nickname-modal').classList.contains('hidden')).toBe(true);
 window.dispatchEvent(new Event('blur'));expect(controls.isEnabled()).toBe(false);controls.onAction('mark');expect(game().board.flagCount).toBe(0);
});
it('页面可见不等于窗口已聚焦：失焦后visibilitychange不能重新启用手柄',()=>{
 boot();window.dispatchEvent(new Event('blur'));
 vi.spyOn(document,'hidden','get').mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));
 expect(controls.isEnabled()).toBe(false);controls.onAction('mark');expect(game().board.flagCount).toBe(0);
 window.dispatchEvent(new Event('focus'));expect(controls.isEnabled()).toBe(true);
});
it('首点走Worker生成，后台完成后暂停且生成耗时不计入',async()=>{
 boot(true);$('board-canvas').focus();key('Enter');await flush();
 expect(client.prepare).toHaveBeenCalledWith(expect.objectContaining({antiGuess:true}),0);expect(game().state).toBe('generating');expect($('game-status').textContent).toContain('正在生成');
 vi.advanceTimersByTime(3000);expect($('timer').textContent).toBe('00:00');window.dispatchEvent(new Event('blur'));
 resolve({mineSet:[20,22,24,36,40,46,58,60,70,80],antiGuessActive:true,warning:null,stats:null});await flush();
 expect(game().state).toBe('paused');expect($('pause-overlay').classList.contains('hidden')).toBe(false);
});
it('重开取消旧生成与Worker，destroy同时释放轮询和生成器',async()=>{
 boot(true);$('board-canvas').focus();key('Enter');await flush();const previous=game();
 controls.onAction('restart');expect(game()).not.toBe(previous);expect(game().state).toBe('ready');expect(client.cancel).toHaveBeenCalled();
 resolve({mineSet:[20,22,24,36,40,46,58,60,70,80],antiGuessActive:true,warning:null});await flush();expect(game().state).toBe('ready');expect(previous.state).toBe('ready');
 app.destroy();app=null;expect(stop).toHaveBeenCalledTimes(1);expect(client.destroy).toHaveBeenCalledTimes(1);
 // 排空jsdom的storage/焦点0ms通知；存活的应用200ms interval仍会被下条断言检出。
 vi.advanceTimersByTime(0);expect(vi.getTimerCount()).toBe(0);
});
