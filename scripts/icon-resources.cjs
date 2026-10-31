// 在内存中替换 Windows PE 图标资源；不调用外部工具，不修改输入 Buffer。
const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit');

function asBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new Error(`${label}必须为二进制数据`);
}

function parseExecutable(value) {
  try {
    const buffer = asBuffer(value, '应用程序');
    const executable = NtExecutable.from(buffer, { ignoreCert: true });
    return { buffer, executable, resources: NtExecutableResource.from(executable) };
  } catch {
    throw new Error('无法解析应用程序：可执行文件格式无效');
  }
}

function parseIcon(value) {
  try {
    const buffer = asBuffer(value, '图标');
    if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) throw new Error();
    const count = buffer.readUInt16LE(4);
    const directoryEnd = 6 + 16 * count;
    if (!count || directoryEnd > buffer.length) throw new Error();
    for (let index = 0; index < count; index++) {
      const position = 6 + index * 16;
      const size = buffer.readUInt32LE(position + 8);
      const offset = buffer.readUInt32LE(position + 12);
      if (size < 4 || offset < directoryEnd || offset + size > buffer.length) throw new Error();
      const image = buffer.subarray(offset, offset + size);
      const png = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (png) {
        if (size < 33 || image.toString('ascii', 12, 16) !== 'IHDR' ||
            image.readUInt32BE(16) !== (buffer[position] || 256) ||
            image.readUInt32BE(20) !== (buffer[position + 1] || 256)) throw new Error();
      } else if (image.readUInt32LE(0) !== 40 || size < 40) throw new Error();
    }
    return Data.IconFile.from(buffer).icons.map(item => item.data);
  } catch {
    throw new Error('无法解析图标：ICO 文件或图像帧无效');
  }
}

function groupsFromEntries(entries) {
  return entries.filter(entry => entry.type === 14).map(entry => {
    const data = Buffer.from(entry.bin);
    if (data.length < 6 || data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) throw new Error();
    const count = data.readUInt16LE(4);
    if (!count || data.length < 6 + count * 14) throw new Error();
    const icons = [];
    for (let index = 0; index < count; index++) {
      const offset = 6 + index * 14;
      const id = data.readUInt16LE(offset + 12);
      const icon = entries.find(item => item.type === 3 && item.id === id && item.lang === entry.lang);
      if (!icon || icon.bin.byteLength !== data.readUInt32LE(offset + 8)) throw new Error();
      icons.push({ width: data[offset] || 256, height: data[offset + 1] || 256, data: Buffer.from(icon.bin) });
    }
    return { id: entry.id, lang: entry.lang, icons };
  });
}

function readIconGroups(exeBuffer) {
  try {
    return groupsFromEntries(parseExecutable(exeBuffer).resources.entries);
  } catch {
    throw new Error('无法读取应用程序图标：可执行文件或图标资源无效');
  }
}

function nonIconEntries(entries) {
  return entries.filter(entry => entry.type !== 3 && entry.type !== 14).map(entry => ({
    key: JSON.stringify([entry.type, entry.id, entry.lang, entry.codepage]),
    data: Buffer.from(entry.bin),
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function embedIcon(exeBuffer, icoBuffer) {
  const { buffer, executable, resources } = parseExecutable(exeBuffer);
  const icons = parseIcon(icoBuffer);
  try {
    const preserved = nonIconEntries(resources.entries);
    // pe-library 排除证书并保留其前方 overlay；若证书后还有数据，也一并保留。
    const certificate = executable.newHeader.optionalHeaderDataDirectory.get(4);
    if (certificate.size > 0) {
      const end = certificate.virtualAddress + certificate.size;
      if (certificate.virtualAddress < 0 || end > buffer.length) throw new Error();
      if (end < buffer.length) executable.setExtraData(Buffer.concat([
        Buffer.from(executable.getExtraData() || new ArrayBuffer(0)), buffer.subarray(end),
      ]));
    }
    const overlay = Buffer.from(executable.getExtraData() || new ArrayBuffer(0));
    let groups = resources.entries.filter(entry => entry.type === 14).map(({ id, lang }) => ({ id, lang }));
    if (!groups.length) groups = [{ id: 1, lang: 1033 }];
    resources.entries = resources.entries.filter(entry => entry.type !== 3 && entry.type !== 14);
    for (const { id, lang } of groups) Resource.IconGroupEntry.replaceIconsForResource(resources.entries, id, lang, icons);
    resources.outputResource(executable);
    const output = Buffer.from(executable.generate());
    const verified = parseExecutable(output);
    const remaining = nonIconEntries(verified.resources.entries);
    if (remaining.length !== preserved.length || remaining.some((entry, index) =>
      entry.key !== preserved[index].key || !entry.data.equals(preserved[index].data))) {
      throw new Error('非图标资源发生变化');
    }
    if (!Buffer.from(verified.executable.getExtraData() || new ArrayBuffer(0)).equals(overlay)) {
      throw new Error('附加数据发生变化');
    }
    if (groupsFromEntries(verified.resources.entries).length !== groups.length) throw new Error('图标组数量不一致');
    return output;
  } catch {
    throw new Error('无法写入应用程序图标：资源替换或完整性校验失败');
  }
}

module.exports = { embedIcon, readIconGroups };
