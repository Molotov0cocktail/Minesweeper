// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../src/renderer/render.js', () => ({ drawBoard: vi.fn() }));
vi.mock('../src/core/game.js', async original => {
  const actual=await original(); return {...actual, createGame:vi.fn(actual.createGame)};
});
vi.mock('../src/core/board.js', async original => ({...await original(),randomMineSet:vi.fn(()=>new Set([20,22,24,36,40,46,58,60,70,80]))}));
import { createGame } from '../src/core/game.js';
import { drawBoard } from '../src/renderer/render.js';
import * as main from '../src/renderer/main.js';
let app, canvas, ctx;
const $=id=>document.getElementById(id);
const game=()=>createGame.mock.results.at(-1).value;
const key=(target,key,more={})=>target.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...more}));
function boot() {
  expect(main.startApp).toBeTypeOf('function');
  app=main.startApp({host:$('app'),storage:localStorage});
}
beforeEach(()=>{
  vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear();
  localStorage.setItem('minesweeper.settings.v1',JSON.stringify({antiGuess:false,antiGuessMethod:'standard',maxAttempts:20,maxRegionAttempts:20}));
  document.body.className='';
  document.body.innerHTML='<div id="app"><div id="board-wrap"><canvas id="board-canvas" style="border:2px solid black"></canvas><div id="scale-handle"></div></div></div>';
  canvas=$('board-canvas'); ctx={setTransform:vi.fn()};
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx);
  vi.spyOn(canvas,'getBoundingClientRect').mockImplementation(()=>({left:10,top:20,x:10,y:20,width:parseFloat(canvas.style.width)+4,height:parseFloat(canvas.style.height)+4}));
  vi.stubGlobal('devicePixelRatio',2);
});
afterEach(()=>{app?.destroy(); app=null; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();});

describe('装配与绘制生命周期',()=>{
  it('DPR为2时CSS维持逻辑大小，计时轮询不重画棋盘',()=>{
    boot();
    expect(canvas.width).toBe(2*parseFloat(canvas.style.width));
    expect(canvas.height).toBe(2*parseFloat(canvas.style.height));
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2,0,0,2,0,0);
    const draws=drawBoard.mock.calls.length;
    vi.advanceTimersByTime(1200);
    expect(drawBoard).toHaveBeenCalledTimes(draws);
    expect($('timer').textContent).toBe('00:00');
  });
  it('换高级立即缩小格子，棋盘不溢出窗口可用宽度',()=>{
    boot(); $('sidebar-toggle').click();
    hostMode('expert').click();
    expect(game().cols).toBe(30);
    expect(parseFloat(canvas.style.width)).toBeLessThanOrEqual(window.innerWidth-248-40);
    expect(parseFloat(canvas.style.width)/30).toBeLessThan(48);
    expect($('game-meta').textContent).toContain('高级');
  });
  it('暂停后重开清除遮罩并重置时间，采用最新防猜测设置',()=>{
    boot(); canvas.focus(); key(canvas,'Enter'); $('pause-btn').click();
    expect(game().state).toBe('paused');
    expect($('pause-overlay').classList.contains('hidden')).toBe(false);
    $('anti-guess-toggle').checked=true;
    $('anti-guess-toggle').dispatchEvent(new Event('change'));
    // 模态中的 F2 不重开；操作按钮或恢复后 F2 可以重开。
    $('restart-btn').click();
    expect(game().state).toBe('ready');
    expect(game().antiGuess).toBe(true);
    expect($('pause-overlay').classList.contains('hidden')).toBe(true);
    expect($('timer').textContent).toBe('00:00');
  });
  it('销毁后清除计时器、resize和键盘监听，可重新挂载',()=>{
    boot(); app.destroy(); app=null;
    const calls=createGame.mock.calls.length, draws=drawBoard.mock.calls.length;
    key(document,'F2'); window.dispatchEvent(new Event('resize')); vi.advanceTimersByTime(1000);
    expect(createGame).toHaveBeenCalledTimes(calls);
    expect(drawBoard).toHaveBeenCalledTimes(draws);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('适配扣除实际状态区和提示高度，键盘移动滚入可视区',()=>{
    boot();
    const mainArea=document.querySelector('.ms-main');
    vi.spyOn(mainArea,'clientHeight','get').mockReturnValue(480);
    vi.spyOn(document.querySelector('.ms-game-summary'),'offsetHeight','get').mockReturnValue(80);
    vi.spyOn($('controls-help'),'offsetHeight','get').mockReturnValue(100);
    window.dispatchEvent(new Event('resize'));
    expect(parseFloat(canvas.style.height)).toBeLessThanOrEqual(300);
    const marker=$('board-focus'); marker.scrollIntoView=vi.fn();
    canvas.focus(); key(canvas,'ArrowDown');
    expect(marker.scrollIntoView).toHaveBeenCalledWith({block:'nearest',inline:'nearest'});
  });
});
function hostMode(mode){return document.querySelector('.ms-mode[data-mode="'+mode+'"]');}

describe('键盘与鼠标',()=>{
  it('Tab到棋盘可移动、F标记，重复按键不重复切换，空格翻格',()=>{
    boot(); expect(canvas.tabIndex).toBe(0); canvas.focus();
    key(canvas,'ArrowRight'); key(canvas,'f');
    expect(game().board.cells[1].state).toBe('flagged');
    key(canvas,'f',{repeat:true});
    expect(game().board.cells[1].state).toBe('flagged');
    expect(canvas.getAttribute('aria-label')).toContain('旗');
    key(canvas,'ArrowDown'); key(canvas,' ');
    expect(game().board.cells[10].state).toBe('revealed');
    expect(game().state).toBe('playing');
    key(canvas,'p'); expect(game().state).toBe('paused');
    expect($('board-focus').classList.contains('hidden')).toBe(true);
    $('resume-btn').click(); expect(game().state).toBe('playing');
    key(canvas,'F2'); expect(game().state).toBe('ready');
  });
  it('边界不回绕，鼠标内容坐标避开边框且不乘DPR',()=>{
    boot(); canvas.focus(); key(canvas,'ArrowLeft'); key(canvas,'ArrowUp'); key(canvas,'f');
    expect(game().board.cells[0].state).toBe('flagged');
    const size=parseFloat(canvas.style.width)/9;
    canvas.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:12+size*2.5,clientY:22+size*1.5,bubbles:true}));
    expect(game().board.cells[11].state).toBe('flagged');
    const before=game().board.flagCount;
    canvas.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:10,clientY:20,bubbles:true}));
    expect(game().board.flagCount).toBe(before);
  });
  it('输入框、修饰键、输入法或昵称弹窗中不触发游戏快捷键',()=>{
    boot(); const original=game();
    $('custom-rows').focus(); key($('custom-rows'),'F2');
    canvas.focus(); key(canvas,'F2',{ctrlKey:true}); key(canvas,'F2',{isComposing:true});
    expect(game()).toBe(original);
    $('nickname-modal').classList.remove('hidden');
    key(document,'F2'); key(canvas,'f');
    expect(game()).toBe(original); expect(game().board.flagCount).toBe(0);
  });
  it('失焦只暂停进行中对局，重新获得焦点不自动继续',()=>{
    boot(); window.dispatchEvent(new Event('blur')); expect(game().state).toBe('ready');
    game().reveal(0,0); window.dispatchEvent(new Event('blur'));
    expect(game().state).toBe('paused');
    expect($('pause-overlay').classList.contains('hidden')).toBe(false);
    window.dispatchEvent(new Event('focus')); expect(game().state).toBe('paused');
    $('resume-btn').click(); expect(game().state).toBe('playing');
    vi.spyOn(document,'hidden','get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange')); expect(game().state).toBe('paused');
  });
  it('暂停遮罩允许P继续，但仍屏蔽F2和昵称弹窗中的P',()=>{
    boot(); game().reveal(0,0); key(document,'p');
    expect(game().state).toBe('paused');
    const original=game(); key($('resume-btn'),'F2'); expect(game()).toBe(original);
    key($('resume-btn'),'p'); expect(game().state).toBe('playing');
    $('nickname-modal').classList.remove('hidden');
    key(canvas,'p'); expect(game().state).toBe('playing');
  });
  it('踩雷后进度只统计安全格，数字格键盘使用两种chord',()=>{
    boot(); canvas.focus(); key(canvas,'Enter');
    const g=game();
    const left=vi.spyOn(g,'chordLeft'), right=vi.spyOn(g,'chordRight');
    key(canvas,'Enter'); expect(left).toHaveBeenCalledWith(0,0);
    key(canvas,'f'); expect(right).toHaveBeenCalledWith(0,0);
    key(canvas,'ArrowDown'); key(canvas,'ArrowDown'); key(canvas,'ArrowRight'); key(canvas,'ArrowRight'); key(canvas,'Enter');
    expect(g.state).toBe('lost');
    const safe=g.board.cells.filter(c=>c.state==='revealed'&&!c.isMine).length;
    expect(Number($('game-progress').getAttribute('value'))).toBe(safe);
  });
});
