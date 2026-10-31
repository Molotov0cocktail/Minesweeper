// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUI } from '../src/renderer/ui.js';
let ui, host, actions;
const $ = id => host.querySelector('#'+id);
beforeEach(() => {
  document.body.className='';
  document.body.innerHTML='<div id="app"><canvas id="board-canvas" tabindex="0"></canvas></div>';
  host=document.getElementById('app');
  actions={resume:vi.fn(),submitNickname:vi.fn()};
  ui=createUI(host,{actions,leaderboard:{getScores:()=>[],getLastNickname:()=> '玩家甲'}});
});
afterEach(() => ui.destroy?.());
const snap = (state, more={}) => ({state,mode:'expert',rows:16,cols:30,mines:99,revealedCount:23,...more});
describe('对局反馈',()=>{
  it('生成状态有明确提示，禁用暂停但允许重开取消',()=>{
    ui.setGameStatus(snap('generating'));
    expect($('game-status').textContent).toContain('正在生成');
    expect($('pause-btn').disabled).toBe(true);expect($('restart-btn').disabled).toBe(false);
    expect($('board-canvas').getAttribute('aria-busy')).toBe('true');
    ui.setGameStatus(snap('ready'));expect($('board-canvas').getAttribute('aria-busy')).toBe('false');
  });
  it('手柄状态与说明可见，未映射手柄有明确提示',()=>{
    ui.setControllerStatus({connected:true,supported:true,id:'测试手柄'});
    expect($('controller-status').getAttribute('role')).toBe('status');
    expect($('controller-status').textContent).toContain('测试手柄');
    expect($('controls-help').textContent).toContain('800');
    expect($('controls-help').textContent).toMatch(/A.*X/);
    ui.setControllerStatus({connected:true,supported:false,id:'未知'});expect($('controller-status').textContent).toContain('不支持');
    ui.setControllerStatus({connected:false,supported:false,id:''});expect($('controller-status').textContent).toContain('未连接');
  });
  it('显示规格、状态、真实安全格进度和当前难度',()=>{
    ui.setGameStatus(snap('playing'));
    expect($('game-meta').textContent).toMatch(/高级.*16.*30.*99/);
    expect($('game-status').textContent).toContain('进行中');
    expect($('game-status').getAttribute('role')).toBe('status');
    expect($('game-progress').getAttribute('max')).toBe('381');
    expect($('game-progress').getAttribute('value')).toBe('23');
    expect(host.querySelector('[data-mode="expert"]').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-mode="beginner"]').getAttribute('aria-pressed')).toBe('false');
    expect($('controls-help').textContent).toMatch(/方向键/);
    expect($('controls-help').textContent).toContain('F2');
  });
  it.each(['ready','paused','won','lost'])('%s 不能点暂停',state=>{
    ui.setGameStatus(snap(state)); expect($('pause-btn').disabled).toBe(true);
    ui.setGameStatus(snap('playing')); expect($('pause-btn').disabled).toBe(false);
  });
  it('菜单展开语义与隐藏侧栏键盘隔离',()=>{
    expect($('sidebar-toggle').getAttribute('aria-expanded')).toBe('false');
    expect($('sidebar-toggle').getAttribute('aria-controls')).toBe('sidebar');
    expect($('sidebar').inert).toBe(true);
    $('sidebar-toggle').click();
    expect($('sidebar-toggle').getAttribute('aria-expanded')).toBe('true');
    expect($('sidebar').inert).toBe(false);
  });
});
describe('昵称和暂停焦点',()=>{
  it('昵称自动选中，Enter 提交一次并返回焦点',()=>{
    $('board-canvas').focus(); ui.showNicknamePrompt();
    expect($('nickname-modal').getAttribute('role')).toBe('dialog');
    expect($('nickname-modal').getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe($('nickname-input'));
    expect($('nickname-input').selectionEnd).toBe(3);
    $('nickname-input').value='  新玩家  ';
    $('nickname-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    expect(actions.submitNickname).toHaveBeenCalledTimes(1);
    expect(actions.submitNickname).toHaveBeenCalledWith('新玩家');
    expect($('nickname-modal').classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe($('board-canvas'));
  });
  it('输入法确认不提交；Escape 取消；Tab 不离开弹窗',()=>{
    $('board-canvas').focus(); ui.showNicknamePrompt();
    $('nickname-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));
    expect(actions.submitNickname).not.toHaveBeenCalled();
    $('nickname-cancel').focus();
    $('nickname-cancel').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe($('nickname-input'));
    $('nickname-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe($('nickname-cancel'));
    $('nickname-cancel').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect($('nickname-modal').classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe($('board-canvas'));
  });
  it('暂停聚焦继续，Escape 恢复；复位关闭所有临时界面',()=>{
    $('board-canvas').focus(); ui.setPauseOverlay(true);
    expect(document.activeElement).toBe($('resume-btn'));
    $('resume-btn').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(actions.resume).toHaveBeenCalledTimes(1);
    ui.showNicknamePrompt(); ui.showLeaderboard(); ui.resetTransient();
    for(const id of ['pause-overlay','nickname-modal','leaderboard-modal']) expect($(id).classList.contains('hidden')).toBe(true);
  });
  it('销毁后 document 事件不继续操作旧界面',()=>{
    ui.showLeaderboard(); ui.destroy();
    document.body.click();
    expect($('leaderboard-modal').classList.contains('hidden')).toBe(false);
  });
  it('恢复时原触发按钮已禁用则焦点返回棋盘',()=>{
    ui.setGameStatus(snap('playing')); $('pause-btn').focus();
    ui.setPauseOverlay(true); ui.setGameStatus(snap('paused'));
    ui.setPauseOverlay(false);
    expect(document.activeElement).toBe($('board-canvas'));
  });
});
