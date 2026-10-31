import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const mod={exports:{}};
const electron={app:{whenReady:()=>({then:()=>{}}),on:()=>{}},BrowserWindow:class{}};
vm.runInNewContext(readFileSync(new URL('../scripts/smoke.cjs',import.meta.url),'utf8'),{
  require:Object.assign(name=>name==='electron'?electron:require(name),{main:null}),
  module:mod, __dirname:new URL('../scripts',import.meta.url).pathname, console, process:{exitCode:0},
});
const valid=()=>({consoleLines:[],rendererGone:null,failLoad:null,cells:{canvasExists:true,canvasW:432,canvasH:432,modeButtons:3,hasGetVersion:true,noInstallerApi:true,noInstallerOpenBtn:true,hasSidebarToggle:true,bodyClass:''},checks:{modeFits:true,keyboardMark:true,keyboardReveal:true,pauseRestart:true,sidebar:true,leaderboard:true,workerGeneration:true,controller:true,controllerMenu:true,rebind:true,focusView:true,helpPage:true}});
function failures(result){expect(mod.exports.collectSmokeFailures).toBeTypeOf('function');return mod.exports.collectSmokeFailures(result);}
describe('冒烟失败必须可被CI检测',()=>{
  it.each([0,1])('真实Electron退出接口必须返回检查结果码%s',async code=>{
    const snapshot=valid();if(code)snapshot.cells.canvasW=0;
    const exit=vi.fn();const app={setPath:()=>{},whenReady:async()=>{},exit,quit:()=>{},once:()=>{},on:()=>{}};
    const executeJavaScript=vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(snapshot.cells).mockResolvedValueOnce(snapshot.checks).mockResolvedValueOnce(snapshot.checks).mockResolvedValue(undefined);
    const fakeFs={mkdtempSync:()=> 'isolated-test',writeFileSync:()=>{},rmSync:()=>{}};
    class Window {webContents={on:()=>{},executeJavaScript,capturePage:async()=>({toPNG:()=>new Uint8Array()})};loadFile=async()=>{};focus=()=>{};destroy=()=>{};isDestroyed=()=>false;}
    const module={exports:{}};
    vm.runInNewContext(readFileSync(new URL('../scripts/smoke.cjs',import.meta.url),'utf8'),{
      require:Object.assign(name=>name==='electron'?{app,BrowserWindow:Window}:name==='fs'?fakeFs:require(name),{main:null}),module,__dirname:'D:/Minesweeper/scripts',console:{log:()=>{},error:()=>{}},process:{versions:{},exitCode:0},setTimeout,clearTimeout,
    });
    await module.exports.runSmoke();expect(exit).toHaveBeenCalledWith(code);
  });
  it('Electron主进程中即使require.main不同仍执行入口',()=>{
    const setPath=vi.fn();
    const fakeElectron={app:{setPath,whenReady:()=>new Promise(()=>{}),on:()=>{}}};
    vm.runInNewContext(readFileSync(new URL('../scripts/smoke.cjs',import.meta.url),'utf8'),{
      require:Object.assign(name=>name==='electron'?fakeElectron:name==='fs'?{mkdtempSync:()=> 'isolated-test'}:require(name),{main:null}),
      module:{exports:{}},__dirname:'D:/Minesweeper/scripts',console,
      process:{versions:{electron:'33'},type:'browser',exitCode:0},
    });
    expect(setPath).toHaveBeenCalledWith('userData','isolated-test');
  });
  it('只接受页面加载与所有交互检查均成功的报告',()=>{
    expect(failures(valid())).toEqual([]);
    expect(failures({}).length).toBeGreaterThan(0);
  });
  it.each(['rendererGone','failLoad'])('%s 存在即失败',key=>{
    const r=valid();r[key]='失败';expect(failures(r).length).toBeGreaterThan(0);
  });
  it('控制台报错或空画布失败',()=>{
    const r=valid();r.consoleLines=['JS错误'];r.cells.canvasW=0;
    expect(failures(r).length).toBeGreaterThanOrEqual(2);
  });
  it.each(['hasGetVersion','noInstallerApi','noInstallerOpenBtn','hasSidebarToggle'])('preload/DOM 契约 %s 必须满足',key=>{
    const r=valid();r.cells[key]=false;expect(failures(r).length).toBeGreaterThan(0);
  });
  it.each(['modeFits','keyboardMark','keyboardReveal','pauseRestart','sidebar','leaderboard','workerGeneration','controller','controllerMenu','rebind','focusView','helpPage'])('交互检查 %s 不通过即失败',key=>{
    const r=valid();r.checks[key]=false;expect(failures(r).length).toBeGreaterThan(0);
  });
});
