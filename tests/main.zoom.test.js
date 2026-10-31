// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('../src/renderer/render.js',()=>({drawBoard:vi.fn()}));
vi.mock('../src/core/game.js',async original=>{const m=await original();return {...m,createGame:vi.fn(m.createGame)};});
import {createGame} from '../src/core/game.js';
import {startApp} from '../src/renderer/main.js';
let app;const $=id=>document.getElementById(id);
beforeEach(()=>{
 vi.useFakeTimers();vi.clearAllMocks();localStorage.clear();document.body.className='';
 localStorage.setItem('minesweeper.settings.v1',JSON.stringify({antiGuess:false,antiGuessMethod:'standard'}));
 document.body.innerHTML='<div id="app"><div id="board-wrap"><canvas id="board-canvas"></canvas><div id="scale-handle"></div></div></div>';
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({setTransform:vi.fn()});
 vi.stubGlobal('innerWidth',1920);vi.stubGlobal('innerHeight',1080);vi.stubGlobal('devicePixelRatio',2);
 app=startApp({host:$('app'),storage:localStorage,gamepadFactory:()=>()=>{}});
});
afterEach(()=>{app?.destroy();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const size=()=>parseFloat($('board-canvas').style.width)/9;
function drag(delta){$('scale-handle').dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:0,clientY:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:delta,clientY:0}));window.dispatchEvent(new MouseEvent('mouseup'));}
it('全屏自动适配可超过48px，DPR与逻辑尺寸分离',()=>{
 expect(size()).toBe(Math.floor(Math.min((1920-56)/9,(1080-220)/9)));
 expect(size()).toBeGreaterThan(48);expect($('board-canvas').width).toBe(2*9*size());
});
it('拖动可超过96和256px、侧栏准确回显且不累积，resize和专注保留',()=>{
 const original=createGame.mock.results.at(-1).value,initial=size();drag(600);
 expect(size()).toBe(initial+200);expect($('board-size').value).toBe(String(initial+200));
 drag(300);expect(size()).toBe(initial+300);expect($('board-size').value).toBe(String(initial+300));
 expect([...$('board-size').options].filter(o=>Number(o.value)>48)).toHaveLength(1);
 window.dispatchEvent(new Event('resize'));$('focus-toggle').click();expect(size()).toBe(initial+300);
 expect(createGame.mock.results.at(-1).value).toBe(original);
});
it('缩小保留16px下限，自动选择恢复窗口适配，新局恢复自动',()=>{
 drag(-9000);expect(size()).toBe(16);drag(1200);expect(size()).toBe(416);
 $('board-size').value='0';$('board-size').dispatchEvent(new Event('change'));expect(size()).toBe(95);
 drag(90);$('restart-btn').click();expect(size()).toBe(95);expect($('board-size').value).toBe('0');
});
it('旧标准偏好启动和重开均统一局部修复，保留关闭状态',()=>{
 expect(createGame.mock.calls.at(-1)[0]).toMatchObject({antiGuess:false,antiGuessMethod:'advanced'});
 $('restart-btn').click();expect(createGame.mock.calls.at(-1)[0].antiGuessMethod).toBe('advanced');
});
it('大格子DPR2下右键仍标中正确行列，不因物理像素改变坐标',()=>{
 drag(600);const cell=size(),canvas=$('board-canvas');
 vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:10,top:20,width:9*cell,height:9*cell});
 canvas.dispatchEvent(new MouseEvent('mousedown',{button:2,clientX:10+1.5*cell,clientY:20+2.5*cell,bubbles:true,cancelable:true}));
 const game=createGame.mock.results.at(-1).value;
 expect(game.board.cells[2*9+1].state).toBe('flagged');expect(game.board.flagCount).toBe(1);
});
