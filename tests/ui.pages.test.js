// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {createUI} from '../src/renderer/ui.js';
const D={reveal:0,mark:1,menu:2,pause:9,restart:3,focus:11,help:8};
let ui,host,actions;
const $=id=>host.querySelector('#'+id);
beforeEach(()=>{
 document.body.className='';document.body.innerHTML='<div id="app"><div id="board-wrap"><canvas id="board-canvas" tabindex="0"></canvas><div id="scale-handle"></div></div></div>';host=document.getElementById('app');
 actions={selectMode:vi.fn(),applyCustom:vi.fn(),toggleAntiGuess:vi.fn(),setAntiGuessMethod:vi.fn(),setMaxRegionAttempts:vi.fn(),setGamepadBinding:vi.fn(),resetGamepadBindings:vi.fn(),setFocusView:vi.fn(),submitNickname:vi.fn(),resume:vi.fn(),openLeaderboard:()=>ui.showLeaderboard()};
 ui=createUI(host,{actions,leaderboard:{getScores:()=>[],getLastNickname:()=> '玩家甲'}});
});
afterEach(()=>ui.destroy());
it('主棋盘没有常驻教程/连接说明；操作说明在隐藏专页',()=>{
 expect(host.querySelector('.ms-main > footer')).toBeNull();
 expect($('help-page').classList.contains('hidden')).toBe(true);
 expect($('controls-help').closest('#help-page')).toBe($('help-page'));
 expect($('ag-settings-hint').closest('#help-page')).toBe($('help-page'));
 expect($('controller-status').closest('#controls-page')).toBe($('controls-page'));
 ui.setGameStatus({state:'ready',mode:'beginner',rows:9,cols:9,mines:10,revealedCount:0});expect($('game-status').textContent).not.toContain('点击');
 $('help-open').click();expect($('help-page').classList.contains('hidden')).toBe(false);expect($('board-wrap').classList.contains('hidden')).toBe(true);
 $('help-back').click();expect($('board-wrap').classList.contains('hidden')).toBe(false);
});
it('X菜单/方向/A确认覆盖难度选择，B关闭并恢复棋盘焦点',()=>{
 expect(ui.handleController('menu')).toBe(true);expect(ui.getSidebarOpen()).toBe(true);expect(ui.hasControllerContext()).toBe(true);
 ui.handleController('down');ui.handleController('reveal');expect(actions.selectMode).toHaveBeenCalledWith('intermediate');
 ui.handleController('mark');expect(ui.getSidebarOpen()).toBe(false);expect(document.activeElement).toBe($('board-canvas'));
 expect(ui.handleController('mark')).toBe(false);
});
it('侧栏数值/checkbox/select和应用按钮均可手柄编辑',()=>{
 ui.handleController('menu');$('custom-rows').focus();ui.handleController('right');expect($('custom-rows').value).toBe('10');
 $('custom-apply').focus();ui.handleController('reveal');expect(actions.applyCustom).toHaveBeenCalledWith(10,9,10);
 $('anti-guess-toggle').focus();ui.handleController('reveal');expect(actions.toggleAntiGuess).toHaveBeenCalledWith(false);
 expect($('ag-method')).toBeNull();expect($('ag-region-attempts').disabled).toBe(false);
 $('ag-region-attempts').focus();ui.handleController('left');expect(actions.setMaxRegionAttempts).toHaveBeenCalledWith(19);
});
it('排行榜tabs可导航确认，说明/键位页可B返回，不操作棋盘',()=>{
 ui.handleController('menu');$('leaderboard-open').focus();ui.handleController('reveal');expect($('leaderboard-modal').classList.contains('hidden')).toBe(false);
 const first=host.querySelector('.ms-lb-tab');first.focus();ui.handleController('right');ui.handleController('reveal');expect(document.activeElement.classList.contains('active')).toBe(true);
 ui.handleController('mark');expect($('leaderboard-modal').classList.contains('hidden')).toBe(true);
 ui.handleController('help');expect($('help-page').classList.contains('hidden')).toBe(false);ui.handleController('mark');expect($('help-page').classList.contains('hidden')).toBe(true);
 ui.showControls();expect($('controls-page').classList.contains('hidden')).toBe(false);ui.handleController('mark');expect($('controls-page').classList.contains('hidden')).toBe(true);
});
it('键位编辑原位回填与恢复默认，说明表显示实际按键',()=>{
 ui.showControls();const field=$('binding-mark');field.focus();field.value='4';field.dispatchEvent(new Event('change'));
 expect(actions.setGamepadBinding).toHaveBeenCalledWith('mark',4);
 ui.setGamepadBindings({...D,mark:2,menu:1});expect($('binding-mark')).toBe(field);expect(field.value).toBe('2');expect($('binding-menu').value).toBe('1');
 ui.setGamepadBindings({...D,mark:4});expect($('help-binding-mark').textContent).toContain('LB');
 $('bindings-reset').click();expect(actions.resetGamepadBindings).toHaveBeenCalledTimes(1);
});
it('专注按钮与退出按钮可用，HUD与进度同步且不重开',()=>{
 ui.setMineCount(7);ui.setTime(65000);ui.setFocusView(true);
 expect(ui.getFocusView()).toBe(true);expect(document.body.classList.contains('focus-view')).toBe(true);expect($('sidebar').inert).toBe(true);
 expect($('focus-mine-count').textContent).toBe('7');expect($('focus-timer').textContent).toBe('01:05');expect($('focus-toggle').getAttribute('aria-pressed')).toBe('true');
 $('focus-exit').click();expect(ui.getFocusView()).toBe(false);expect(actions.setFocusView).toHaveBeenCalledWith(false);
 $('focus-toggle').click();expect(ui.getFocusView()).toBe(true);ui.handleController('menu');expect(ui.getFocusView()).toBe(false);expect(ui.getSidebarOpen()).toBe(true);
});
it('昵称手柄屏幕键盘能输入、退格、提交，自带焦点作用域',()=>{
 ui.showNicknamePrompt();expect($('nickname-keyboard').classList.contains('hidden')).toBe(true);
 ui.handleController('down');expect($('nickname-keyboard').classList.contains('hidden')).toBe(false);
 const press=key=>{host.querySelector('[data-key="'+key+'"]').focus();ui.handleController('reveal');};
 press('clear');press('a');press('b');press('backspace');expect($('nickname-input').value).toBe('a');press('b');
 $('nickname-submit').focus();ui.handleController('reveal');expect(actions.submitNickname).toHaveBeenCalledWith('ab');expect($('nickname-modal').classList.contains('hidden')).toBe(true);
});
it('暂停可由确认或B恢复，视图切换不穿透模态',()=>{
 $('board-canvas').focus();ui.setPauseOverlay(true);expect(ui.handleController('focus')).toBe(true);expect(ui.getFocusView()).toBe(false);
 ui.handleController('mark');expect(actions.resume).toHaveBeenCalledTimes(1);
});
it('暂停和昵称不重复显示教学段落，缩放也能由手柄调整',()=>{
 expect($('pause-overlay').querySelector('.modal-hint')).toBeNull();expect($('nickname-modal').querySelector('.modal-hint')).toBeNull();
 actions.setBoardSize=vi.fn();ui.handleController('menu');$('board-size').focus();ui.handleController('right');expect(actions.setBoardSize).toHaveBeenCalledWith(16);
 ui.setBoardSize(32);expect($('board-size').value).toBe('32');
});
it('昵称输入到提交存在完整手柄路径，无需外部focus跳转',()=>{
 ui.showNicknamePrompt();ui.handleController('down');
 const seek=predicate=>{for(let i=0;i<90;i++){if(predicate(document.activeElement))return;ui.handleController('right');}throw Error('手柄导航未能到达目标');};
 const enter=key=>{seek(e=>e.dataset.key===key);ui.handleController('reveal');};
 enter('clear');enter('a');enter('b');seek(e=>e.id==='nickname-submit');ui.handleController('reveal');expect(actions.submitNickname).toHaveBeenCalledWith('ab');
});
