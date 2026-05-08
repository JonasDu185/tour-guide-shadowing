const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ---------- 从 server.js 移植的纯函数 ----------

function detectTextType(text) {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  const wordCount = words.length;
  const endsWithPunct = /[.!?]$/.test(trimmed);

  if (!endsWithPunct && wordCount <= 2) return 'word';
  if (endsWithPunct || wordCount >= 6) return 'sentence';
  return 'phrase';
}

function buildSystemPrompt(action, text) {
  switch (action) {
    case 'translate': {
      const wc = text.trim().split(/\s+/).length;
      if (wc <= 2) {
        return '你是一个中英翻译助手。翻译以下英文，同时标注国际音标。\n格式：\n翻译：<中文>\n音标：/<IPA>/';
      }
      return '你是一个中英翻译助手。请将以下英文翻译成准确自然的中文。只返回翻译。';
    }
    case 'grammar':
      return '分析句子语法，用中文简要列出：1.主谓宾 2.时态语态 3.从句类型（如有） 4.关键语法点。控制在150字以内。';
    case 'chat':
      return '你是一个英语学习助教，正在帮学生阅读英文导游词。用中文耐心解答学生的疑问。';
    default:
      return '你是一个英语学习助手。';
  }
}

// ---------- detectTextType 测试 ----------

describe('detectTextType — 文本类型识别', () => {
  it('单个词 → word', () => {
    assert.equal(detectTextType('palace'), 'word');
    assert.equal(detectTextType('  emperor '), 'word');
  });

  it('两个词 → word', () => {
    assert.equal(detectTextType('Summer Palace'), 'word');
    assert.equal(detectTextType('Forbidden City'), 'word');
  });

  it('3-5 词无标点 → phrase', () => {
    assert.equal(detectTextType('the heart of Beijing'), 'phrase');
  });

  it('以 ! 或 ? 结尾 → sentence', () => {
    assert.equal(detectTextType('How amazing is that!'), 'sentence');
  });

  it('以 . 结尾 → sentence', () => {
    assert.equal(detectTextType('It is a grand palace.'), 'sentence');
  });

  it('6 词以上无标点 → sentence', () => {
    assert.equal(detectTextType('located at the very heart of Beijing'), 'sentence');
  });
});

// ---------- buildSystemPrompt 测试 ----------

describe('buildSystemPrompt — AI 提示词构建', () => {
  it('translate + 1~2 词 → 包含音标', () => {
    const p = buildSystemPrompt('translate', 'palace');
    assert.ok(p.includes('音标'));
    assert.ok(p.includes('IPA'));
  });

  it('translate + 短语 → 不包含音标', () => {
    const p = buildSystemPrompt('translate', 'a very large palace');
    assert.ok(!p.includes('音标'));
  });

  it('grammar → 包含主谓宾等语法关键词', () => {
    const p = buildSystemPrompt('grammar', 'any');
    assert.ok(p.includes('语法'));
    assert.ok(p.includes('主谓宾'));
  });

  it('chat → 学习助教', () => {
    const p = buildSystemPrompt('chat', 'any');
    assert.ok(p.includes('学习助教'));
  });

  it('未知 action → 兜底 prompt', () => {
    const p = buildSystemPrompt('unknown', 'text');
    assert.ok(typeof p === 'string' && p.length > 0);
  });
});
