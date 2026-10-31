import {it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),R=require('resedit');
import {embedIcon,readIconGroups} from '../scripts/icon-resources.cjs';
const read=rel=>readFileSync(new URL('../'+rel,import.meta.url));
function exe(){const pe=R.NtExecutable.createEmpty(false,false);pe.setExtraData(Buffer.from('必须保留的overlay'));const resources=R.NtExecutableResource.from(pe);resources.entries.push({type:10,id:'INTEGRITY',lang:1033,codepage:0,bin:Buffer.from('{"asar":"原内容"}')});resources.outputResource(pe);return Buffer.from(pe.generate());}
it('新增/替换每个PE图标组，保留非图标资源、overlay与输入buffer',()=>{
 const original=exe(),copy=Buffer.from(original),ico=read('assets/minesweeper.ico'),first=embedIcon(original,ico);
 expect(original).toEqual(copy);let groups=readIconGroups(first);expect(groups).toHaveLength(1);expect(groups[0].icons.map(i=>i.width)).toEqual([16,20,24,32,48,64,128,256]);
 const pe=R.NtExecutable.from(first),resources=R.NtExecutableResource.from(pe);
 const icon=R.Data.IconFile.from(ico);R.Resource.IconGroupEntry.replaceIconsForResource(resources.entries,101,0,icon.icons.map(i=>i.data));resources.outputResource(pe);
 const final=embedIcon(Buffer.from(pe.generate()),ico),parsed=R.NtExecutable.from(final),entries=R.NtExecutableResource.from(parsed).entries;
 groups=readIconGroups(final);expect(groups).toHaveLength(2);for(const group of groups)expect(group.icons.map(i=>i.width)).toEqual([16,20,24,32,48,64,128,256]);
 expect(Buffer.from(entries.find(e=>e.id==='INTEGRITY').bin)).toEqual(Buffer.from('{"asar":"原内容"}'));expect(Buffer.from(parsed.getExtraData())).toEqual(Buffer.from('必须保留的overlay'));
});
it('非法PE/ICO以中文明确报错',()=>{
 expect(()=>embedIcon(Buffer.from('坏PE'),Buffer.from('坏ICO'))).toThrow(/[\u4e00-\u9fff]/);expect(()=>embedIcon(exe(),Buffer.from('坏ICO'))).toThrow(/[\u4e00-\u9fff]/);
});
it('portable、窗口、staging和重建命令均使用自有图标，并保留不签名策略',()=>{
 const config=read('scripts/setup-builder.yml').toString(),build=read('scripts/build-dist.cjs').toString(),pkg=JSON.parse(read('package.json'));
 expect(config).toMatch(/afterPack:.*icon-after-pack\.cjs/);expect(config).toMatch(/icon:.*assets\/minesweeper\.ico/);expect(config).toContain('  - assets/**');expect(config).toContain('signAndEditExecutable: false');
 expect(build).toContain("'assets'");expect(build).toContain('generate-icons.cjs');expect(pkg.scripts.icons).toBe('node scripts/generate-icons.cjs');expect(pkg.devDependencies.resedit).toBe('1.7.2');
 for(const file of ['electron/main.cjs','electron/setup.cjs'])expect(read(file).toString()).toMatch(/icon:\s*path\.join\(__dirname,\s*['"]\.\.['"],\s*['"]assets['"],\s*['"]minesweeper\.png['"]\)/);
});
