// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {navigateControls} from '../src/renderer/controller-ui.js';
let scope;
beforeEach(()=>{document.body.innerHTML='<section id="scope"><button id="a">一</button><input id="n" type="number" value="5" min="5" max="9" step="2"><select id="s"><option value="one">一</option><option value="two">二</option></select><input id="c" type="checkbox"><button id="z">末</button><div class="hidden" style="display:none"><button id="hide">隐藏</button></div><button disabled>禁用</button><div inert><button>隔离</button></div></section>';scope=document.getElementById('scope');});
const $=id=>document.getElementById(id);
it('作用域导航可循环且不聚焦隐藏/禁用/inert控件，确认仅触发当前按钮',()=>{
 const clicked=vi.fn();$('a').addEventListener('click',clicked);
 expect(navigateControls(scope,'down')).toBe(true);expect(document.activeElement).toBe($('a'));
 navigateControls(scope,'up');expect(document.activeElement).toBe($('z'));navigateControls(scope,'down');expect(document.activeElement).toBe($('a'));
 navigateControls(scope,'reveal');expect(clicked).toHaveBeenCalledTimes(1);expect(navigateControls(scope,'mark')).toBe(false);
});
it('数值左右按step调整并限制上下界，真实派发change',()=>{
 const changed=vi.fn();$('n').addEventListener('change',changed);$('n').focus();
 navigateControls(scope,'left');expect($('n').value).toBe('5');navigateControls(scope,'right');expect($('n').value).toBe('7');
 navigateControls(scope,'left');expect($('n').value).toBe('5');navigateControls(scope,'right');navigateControls(scope,'right');navigateControls(scope,'right');expect($('n').value).toBe('9');expect(changed).toHaveBeenCalledTimes(4);
});
it('选项左右与复选框/A确认可编辑，不只移动焦点',()=>{
 const changed=vi.fn();$('s').addEventListener('change',changed);$('s').focus();navigateControls(scope,'right');expect($('s').value).toBe('two');expect(changed).toHaveBeenCalledTimes(1);
 $('c').focus();navigateControls(scope,'right');expect($('c').checked).toBe(true);navigateControls(scope,'reveal');expect($('c').checked).toBe(false);
});
it('键盘网格上下跨列，横向移键；空作用域安全',()=>{
 scope.innerHTML='<div data-controller-grid="3">'+Array.from({length:9},(_,i)=>'<button id="k'+i+'">'+i+'</button>').join('')+'</div>';
 $('k1').focus();navigateControls(scope,'down');expect(document.activeElement).toBe($('k4'));navigateControls(scope,'right');expect(document.activeElement).toBe($('k5'));navigateControls(scope,'up');expect(document.activeElement).toBe($('k2'));
 expect(()=>navigateControls(null,'down')).not.toThrow();expect(navigateControls(scope,'unknown')).toBe(false);
});
it('键盘网格边缘能进入输入框与提交按钮，不能陷在字母中循环',()=>{
 scope.innerHTML='<input id="name"><div data-controller-grid="3">'+Array.from({length:9},(_,i)=>'<button id="k'+i+'">'+i+'</button>').join('')+'</div><button id="submit">提交</button><button>取消</button>';
 $('k7').focus();navigateControls(scope,'down');expect(document.activeElement).toBe($('submit'));
 $('k1').focus();navigateControls(scope,'up');expect(document.activeElement).toBe($('name'));
});
