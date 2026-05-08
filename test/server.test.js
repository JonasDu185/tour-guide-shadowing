const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// ---------- 从 server.js 移植的纯函数 ----------

function isValidId(id) {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(id);
}

function buildAsrFrame(payload, { msgType = 0x10, flags = 0x00 }) {
  const buf = Buffer.alloc(8);
  buf[0] = 0x11;
  buf[1] = (msgType & 0xF0) | (flags & 0x0F);
  buf[2] = 0x10;
  buf[3] = 0x00;
  buf.writeUInt32BE(payload.length, 4);
  return Buffer.concat([buf, payload]);
}

function parseAsrFrame(data) {
  if (data.length < 8) return null;
  const msgType = data[1] & 0xF0;
  const flags = data[1] & 0x0F;
  let offset = 4;
  const hasSeq = (flags & 0x01) !== 0;
  if (hasSeq) offset += 4;
  if (data.length < offset + 4) return null;
  const size = data.readUInt32BE(offset);
  offset += 4;
  if (data.length < offset + size) return null;
  return { msgType, flags, payload: data.slice(offset, offset + size) };
}

// ---------- isValidId 测试 ----------

describe('isValidId — 路径遍历防护', () => {
  it('允许合法 ID：字母数字下划线连字符', () => {
    assert.equal(isValidId('gugong'), true);
    assert.equal(isValidId('chang_cheng'), true);
    assert.equal(isValidId('yi-he-yuan'), true);
    assert.equal(isValidId('abc123'), true);
  });

  it('拒绝路径遍历字符 ../', () => {
    assert.equal(isValidId('../.env'), false);
    assert.equal(isValidId('../../etc/passwd'), false);
    assert.equal(isValidId('gugong/../secret'), false);
  });

  it('拒绝空字符串和超长 ID', () => {
    assert.equal(isValidId(''), false);
    assert.equal(isValidId('a'.repeat(33)), false);
  });

  it('拒绝特殊字符和空格', () => {
    assert.equal(isValidId('a b'), false);
    assert.equal(isValidId('a;b'), false);
    assert.equal(isValidId('a|b'), false);
  });
});

// ---------- ASR 帧编解码测试 ----------

describe('ASR 帧协议编解码', () => {
  it('编码后解码应还原原始数据', () => {
    const payload = Buffer.from(JSON.stringify({ test: 'hello' }));
    const frame = buildAsrFrame(payload, { msgType: 0x10, flags: 0x00 });
    const parsed = parseAsrFrame(frame);
    assert.ok(parsed);
    assert.equal(parsed.msgType, 0x10);
    assert.deepEqual(JSON.parse(parsed.payload.toString()), { test: 'hello' });
  });

  it('空负载帧编解码', () => {
    const frame = buildAsrFrame(Buffer.alloc(0), { msgType: 0x20, flags: 0x02 });
    const parsed = parseAsrFrame(frame);
    assert.ok(parsed);
    assert.equal(parsed.msgType, 0x20);
    assert.equal(parsed.flags, 0x02);
  });

  it('数据不足时返回 null', () => {
    assert.equal(parseAsrFrame(Buffer.from([0x11, 0x10])), null);
    assert.equal(parseAsrFrame(Buffer.alloc(4)), null);
  });
});
