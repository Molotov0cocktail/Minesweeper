// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('../src/renderer/render.js',()=>({drawBoard:vi.fn()}));
vi.mock('../src/core/game.js',async original=>{const m=await original();return {...m,createGame:vi.fn(m.createGame)};});
import {createGame} from '../src/core/game.js';
import {startApp} from '../src/renderer/main.js';
let app,controls;
const $=id=>document.getElementById(id),game=()=>createGame.mock.results.at(-1).value;
const key=k=>document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
beforeEach(()=>{
 vi.useFakeTimers();vi.clearAllMocks();controls=undefined;document.body.className='';localStorage.clear();
 localStorage.setItem('minesweeper.settings.v1',JSON.stringify({antiGuess:false,maxAttempts:20,antiGuessMethod:'standard',maxRegionAttempts:20}));
 document.body.innerHTML='<div id="app"><div id="board-wrap"><canvas id="board-canvas"></canvas><div id="scale-handle"></div></div></div>';
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({setTransform:vi.fn()});
 app=startApp({host:$('app'),storage:localStorage,gamepadFactory:o=>{controls=o;return ()=>{};}});
});
afterEach(()=>{app?.destroy();vi.restoreAllMocks();vi.useRealTimers();});
it('完整手柄菜单选择与数值编辑，B返回后才标雷',()=>{
 controls.onAction('menu');expect(document.body.classList.contains('sidebar-open')).toBe(true);
 controls.onAction('down');controls.onAction('reveal');expect(game().mode).toBe('intermediate');
 expect(document.activeElement).toBe(document.querySelector('.ms-mode[data-mode="intermediate"]'));
 $('custom-rows').focus();expect(controls.isEnabled()).toBe(true);controls.onAction('right');expect($('custom-rows').value).toBe('10');
 const flags=game().board.flagCount;controls.onAction('mark');expect(game().board.flagCount).toBe(flags);expect(document.body.classList.contains('sidebar-open')).toBe(false);
 controls.onAction('mark');expect(game().board.flagCount).toBe(flags+1);
});
it('重映射冲突交换、立即提供给轮询、持久化与独立恢复默认',()=>{
 expect(controls.getBindings().mark).toBe(1);controls.onAction('menu');$('controls-open').focus();controls.onAction('reveal');
 const mark=$('binding-mark');mark.value='2';mark.dispatchEvent(new Event('change'));
 expect(controls.getBindings()).toMatchObject({mark:2,menu:1});expect($('binding-menu').value).toBe('1');
 const saved=JSON.parse(localStorage.getItem('minesweeper.settings.v1'));expect(saved.gamepadBindings).toMatchObject({mark:2,menu:1});
 $('bindings-reset').focus();controls.onAction('reveal');expect(controls.getBindings()).toMatchObject({mark:1,menu:2});expect(JSON.parse(localStorage.getItem('minesweeper.settings.v1')).antiGuess).toBe(false);
});
it('F10/手柄专注、F1说明和Escape返回，不重开或改写棋盘',()=>{
 const original=game(),board=game().board;controls.onAction('focus');expect(document.body.classList.contains('focus-view')).toBe(true);
 expect(JSON.parse(localStorage.getItem('minesweeper.settings.v1')).focusView).toBe(true);
 key('F10');expect(document.body.classList.contains('focus-view')).toBe(false);expect(game()).toBe(original);expect(game().board).toBe(board);
 key('F1');expect($('help-page').classList.contains('hidden')).toBe(false);key('Escape');expect($('board-wrap').classList.contains('hidden')).toBe(false);
});
it('重新挂载恢复视图和键位，销毁不留下全局视图类',()=>{
 controls.onAction('focus');app.destroy();expect(document.body.classList.contains('focus-view')).toBe(false);
 const stored=JSON.parse(localStorage.getItem('minesweeper.settings.v1'));stored.gamepadBindings={reveal:0,mark:4,menu:2,pause:9,restart:3,focus:11,help:8};localStorage.setItem('minesweeper.settings.v1',JSON.stringify(stored));
 app=startApp({host:$('app'),storage:localStorage,gamepadFactory:o=>{controls=o;return ()=>{};}});
 expect(document.body.classList.contains('focus-view')).toBe(true);expect(controls.getBindings().mark).toBe(4);
});
it('手柄指定棋盘缩放，关闭菜单后保留，可恢复自动且不重开',()=>{
 const original=game();controls.onAction('menu');const size=$('board-size');size.value='32';size.dispatchEvent(new Event('change'));
 controls.onAction('mark');expect(parseFloat($('board-canvas').style.width)).toBe(9*32);expect(game()).toBe(original);
 window.dispatchEvent(new Event('resize'));expect(parseFloat($('board-canvas').style.width)).toBe(9*32);
 controls.onAction('menu');size.value='0';size.dispatchEvent(new Event('change'));expect(parseFloat($('board-canvas').style.width)).not.toBe(9*32);
});
