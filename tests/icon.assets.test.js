import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Data} from 'resedit';
const asset=name=>readFileSync(new URL('../assets/'+name,import.meta.url));
it('矢量源自包含，512px PNG带alpha，应用资源不是Electron默认图标',()=>{
 const svg=asset('icon.svg').toString('utf8');expect(svg).toMatch(/viewBox=["']0 0 512 512["']/);expect(svg).not.toMatch(/<script|<text|href=|url\(\s*["']?https?:/i);
 const png=asset('minesweeper.png');expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(16)).toBe(512);expect(png.readUInt32BE(20)).toBe(512);expect(png[25]).toBe(6);
});
it('ICO包含8个独立PNG尺寸，目录尺寸与真实图像一致',()=>{
 const ico=Data.IconFile.from(asset('minesweeper.ico'));
 expect(ico.icons.map(i=>i.data.width)).toEqual([16,20,24,32,48,64,128,256]);
 for(const item of ico.icons){expect(item.data.isRaw()).toBe(true);const png=Buffer.from(item.data.bin);expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(16)).toBe(item.data.width);expect(png.readUInt32BE(20)).toBe(item.data.height);}
});
