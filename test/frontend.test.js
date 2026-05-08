const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ---------- 从 common.js 移植的纯函数 ----------

function escapeHTML(str) {
  // 模拟：用简单替换代替 DOM 方法（Node 环境无 document）
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tokenizeWords(text) {
  return text.replace(/[.,!?;:]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
}

// ---------- 从 shadowing.js 移植的 buildDiff ----------

function buildDiff(orig, rec) {
  const m = orig.length, n = rec.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = orig[i - 1] === rec[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const result = [];
  let i = m, j = n;
  const stack = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && orig[i - 1] === rec[j - 1]) {
      stack.push({ type: 'match', word: orig[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'insert', word: rec[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      if (stack.length > 0 && stack[stack.length - 1].type === 'insert') {
        const ins = stack.pop();
        stack.push({ type: 'replace', oldWord: orig[i - 1], newWord: ins.word });
      } else {
        stack.push({ type: 'delete', word: orig[i - 1] });
      }
      i--;
    }
  }
  return stack.reverse();
}

// ---------- escapeHTML 测试 ----------

describe('escapeHTML — XSS 防护', () => {
  it('转义 HTML 特殊字符', () => {
    assert.equal(escapeHTML('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('保留普通文本', () => {
    assert.equal(escapeHTML('Hello World'), 'Hello World');
  });
});

// ---------- tokenizeWords 测试 ----------

describe('tokenizeWords — 分词', () => {
  it('拆分英文句子为小写单词', () => {
    assert.deepEqual(tokenizeWords('The Great Wall'), ['the', 'great', 'wall']);
  });

  it('去除标点符号', () => {
    assert.deepEqual(tokenizeWords('Hello, world! How are you?'),
      ['hello', 'world', 'how', 'are', 'you']);
  });

  it('空字符串返回空数组', () => {
    assert.deepEqual(tokenizeWords(''), []);
  });
});

// ---------- buildDiff 测试 ----------

describe('buildDiff — LCS 文本对比', () => {
  it('完全一致：全部 match', () => {
    const result = buildDiff(['hello', 'world'], ['hello', 'world']);
    assert.equal(result.length, 2);
    assert.equal(result[0].type, 'match');
    assert.equal(result[1].type, 'match');
  });

  it('漏词检测：delete', () => {
    const result = buildDiff(['hello', 'beautiful', 'world'], ['hello', 'world']);
    const deletions = result.filter(d => d.type === 'delete');
    assert.equal(deletions.length, 1);
    assert.equal(deletions[0].word, 'beautiful');
  });

  it('多词检测：insert', () => {
    const result = buildDiff(['hello'], ['hello', 'there']);
    const insertions = result.filter(d => d.type === 'insert');
    assert.equal(insertions.length, 1);
  });

  it('错词检测：replace', () => {
    const result = buildDiff(['hello', 'word'], ['hello', 'world']);
    const replaces = result.filter(d => d.type === 'replace');
    assert.equal(replaces.length, 1);
    assert.equal(replaces[0].oldWord, 'word');
    assert.equal(replaces[0].newWord, 'world');
  });

  it('完全不对：差异检测正确', () => {
    const result = buildDiff(['a', 'b'], ['c', 'd']);
    // LCS 贪心回溯在完全无匹配时至少有一个 delete+replace 组合
    assert.ok(result.length >= 2);
    assert.equal(result.every(d => d.type !== 'match'), true);
  });

  it('空数组：全部 insert', () => {
    const result = buildDiff([], ['hello']);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, 'insert');
  });
});
