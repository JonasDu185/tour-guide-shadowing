/* ===========================
   reading.js — 阅读模式 + AI 智能查词
   =========================== */

let currentScript = null;
let isShadowingMode = false;
let selectedText = '';
let selectedRange = null;
let aiCurrentText = '';   // 持久保存，不随 hideFab 清空
let aiChatContext = '';
let aiAbort = null;

// AI Sheet DOM
const aiFab = document.getElementById('aiFab');
const aiSheet = document.getElementById('aiSheet');
const aiSheetBackdrop = document.getElementById('aiSheetBackdrop');
const aiSheetLabel = document.getElementById('aiSheetLabel');
const aiOriginal = document.getElementById('aiOriginal');
const aiTranslation = document.getElementById('aiTranslation');
const aiPhonetic = document.getElementById('aiPhonetic');
const aiGrammarBtn = document.getElementById('aiGrammarBtn');
const aiGrammarResult = document.getElementById('aiGrammarResult');
const aiChatArea = document.getElementById('aiChatArea');
const aiChatMessages = document.getElementById('aiChatMessages');
const aiChatInput = document.getElementById('aiChatInput');

// ---------- Load & Render ----------

async function loadReading() {
  const id = getParam('id');
  if (!id) {
    document.getElementById('readingView').innerHTML = '<p style="text-align:center;color:var(--primary);padding:60px 0;">缺少景点参数</p>';
    return;
  }

  try {
    currentScript = await fetchJSON(API.script(id));
    updateTitle('阅读');
    renderParagraphs();
  } catch (err) {
    document.getElementById('readingView').innerHTML = '<p style="text-align:center;color:var(--primary);padding:60px 0;">加载失败</p>';
    console.error('Failed to load script:', err);
  }
}

function updateTitle(mode) {
  const title = currentScript ? currentScript.title_zh + ' · ' + mode : mode;
  document.getElementById('pageTitle').textContent = title;
  document.title = title;
}

function renderParagraphs() {
  const container = document.getElementById('readingView');
  container.style.display = '';
  const html = currentScript.paragraphs.map((p, i) => `
    <div class="para-block">
      <p class="para-en">${escapeHTML(p.en)}</p>
      <p class="para-zh">${escapeHTML(p.zh)}</p>
    </div>
    ${i < currentScript.paragraphs.length - 1 ? '<hr class="para-divider">' : ''}
  `).join('');
  container.innerHTML = html;
}

// ---------- Text Selection → Floating Button ----------

document.addEventListener('mouseup', onTextSelection);
document.addEventListener('touchend', onTextSelection);

function onTextSelection(e) {
  // 延迟等浏览器完成选区更新
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideFab();
      return;
    }

    const text = sel.toString().trim();
    if (text.length > 3000) { hideFab(); return; }

    // 确保选区在阅读区域内
    const readingView = document.getElementById('readingView');
    if (!readingView || readingView.style.display === 'none') { hideFab(); return; }
    if (!sel.anchorNode || !readingView.contains(sel.anchorNode)) { hideFab(); return; }

    selectedText = text;
    selectedRange = sel.getRangeAt(0);

    // 定位浮动按钮
    const rect = selectedRange.getBoundingClientRect();
    const fabSize = 44;
    let left = rect.right + window.scrollX - fabSize / 2;
    let top = rect.top + window.scrollY - fabSize - 8;

    if (left < 8) left = 8;
    if (left + fabSize > window.innerWidth - 8) left = window.innerWidth - fabSize - 8;
    if (top < 60) top = rect.bottom + window.scrollY + 8;

    aiFab.style.left = left + 'px';
    aiFab.style.top = top + 'px';
    aiFab.style.display = '';
    aiFab.classList.add('ai-fab-show');
  }, 10);
}

function hideFab() {
  aiFab.style.display = 'none';
  aiFab.classList.remove('ai-fab-show');
  selectedText = '';
  selectedRange = null;
}

// 点击浮动按钮外部关闭
document.addEventListener('mousedown', (e) => {
  if (aiFab.style.display !== 'none' && !aiFab.contains(e.target)) {
    hideFab();
  }
});

// -------- AI Sheet --------

async function openAiSheet() {
  if (!selectedText) return;
  aiCurrentText = selectedText;  // 持久保存，不被 hideFab 清空
  hideFab();

  // 取消上一次未完成的请求
  if (aiAbort) aiAbort.abort();
  aiAbort = new AbortController();

  // 重置语法按钮状态
  aiGrammarBtn.textContent = '📖 语法分析';
  aiGrammarBtn.disabled = false;

  // 显示面板
  aiOriginal.textContent = aiCurrentText;
  aiSheetLabel.textContent = '翻译中...';
  aiTranslation.innerHTML = '<div class="ai-loading">AI 翻译中...</div>';
  aiPhonetic.textContent = '';
  aiGrammarBtn.style.display = 'none';
  aiGrammarResult.style.display = 'none';
  aiChatArea.style.display = 'none';
  aiChatMessages.innerHTML = '';
  showSheet();

  try {
    const data = await fetchJSON(API.ai, {
      method: 'POST',
      body: JSON.stringify({ text: aiCurrentText, action: 'translate' }),
      signal: aiAbort.signal,
    });

    aiSheetLabel.textContent = data.textType === 'word' ? '查词' : '翻译';
    aiTranslation.textContent = data.result || '未返回结果';

    // 解析音标
    const phoneticMatch = data.result.match(/音标[：:]\s*\/?(.+?)\/?\s*$/m);
    if (phoneticMatch && data.textType === 'word') {
      aiPhonetic.textContent = '/ˈ' + phoneticMatch[1].replace(/^\/|\/$/g, '') + '/';
    }

    // 语法分析按钮：句子级别显示
    if (data.textType === 'sentence') {
      aiGrammarBtn.style.display = '';
      aiChatArea.style.display = '';
      aiChatContext = aiCurrentText;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;  // 被新请求取消，静默
    aiSheetLabel.textContent = '出错了';
    aiTranslation.textContent = '翻译失败：' + (err.message || '未知错误').slice(0, 100);
    console.error('AI translate failed:', err);
  }
}

async function askGrammar() {
  if (aiAbort) aiAbort.abort();
  aiAbort = new AbortController();

  aiGrammarBtn.disabled = true;
  aiGrammarBtn.textContent = '⏳ 分析中...';
  aiGrammarResult.style.display = '';
  aiGrammarResult.innerHTML = '<div class="ai-loading">AI 正在分析句子结构...</div>';

  try {
    const data = await fetchJSON(API.ai, {
      method: 'POST',
      body: JSON.stringify({ text: aiCurrentText, action: 'grammar' }),
      signal: aiAbort.signal,
    });
    aiGrammarResult.innerHTML = data.result
      .split('\n')
      .filter(line => line.trim())
      .map(line => `<p>${escapeHTML(line)}</p>`)
      .join('');
    aiGrammarBtn.textContent = '📖 语法分析';
  } catch (err) {
    aiGrammarResult.innerHTML = '<div class="ai-error">分析失败：' + (err.name === 'AbortError' ? '已取消' : (err.message || '未知错误')).slice(0, 100) + '</div>';
    console.error('AI grammar failed:', err);
  }
  aiGrammarBtn.disabled = false;
}

async function askChat() {
  const input = aiChatInput.value.trim();
  if (!input) return;

  aiChatInput.value = '';
  aiChatMessages.innerHTML += `<div class="ai-chat-msg ai-chat-user">${escapeHTML(input)}</div>`;
  aiChatMessages.innerHTML += '<div class="ai-chat-msg ai-chat-ai">⏳</div>';
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;

  if (aiAbort) aiAbort.abort();
  aiAbort = new AbortController();

  try {
    const data = await fetchJSON(API.ai, {
      method: 'POST',
      body: JSON.stringify({
        text: input,
        action: 'chat',
        context: aiChatContext,
        question: input,
      }),
      signal: aiAbort.signal,
    });
    // 替换占位
    const lastMsg = aiChatMessages.querySelector('.ai-chat-ai:last-child');
    if (lastMsg) lastMsg.textContent = data.result;
  } catch (err) {
    const lastMsg = aiChatMessages.querySelector('.ai-chat-ai:last-child');
    const reason = err.name === 'AbortError' ? '已取消' : (err.message || '未知错误');
    if (lastMsg) lastMsg.textContent = '回复失败：' + reason.slice(0, 60);
    console.error('AI chat failed:', err);
  }
}

// 回车发送追问
aiChatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') askChat();
});

function showSheet() {
  aiSheetBackdrop.style.display = '';
  aiSheet.style.display = '';
  aiSheet.classList.add('ai-sheet-open');
}

function closeAiSheet() {
  aiSheet.classList.remove('ai-sheet-open');
  aiSheetBackdrop.style.display = 'none';
  aiSheet.style.display = 'none';
  selectedText = '';
  aiCurrentText = '';
  aiChatContext = '';
  if (aiAbort) { aiAbort.abort(); aiAbort = null; }
}

// ---------- Mode Toggle ----------

function toggleMode() {
  isShadowingMode = !isShadowingMode;
  if (isShadowingMode) {
    document.getElementById('readingView').style.display = 'none';
    document.getElementById('readingBottomBar').style.display = 'none';
    document.getElementById('shadowingView').style.display = '';
    document.getElementById('modeToggleBtn').textContent = '阅读 ←';
    document.getElementById('backBtn').setAttribute('onclick', 'toggleMode()');
    hideFab();
    closeAiSheet();
    initShadowing();
  } else {
    document.getElementById('shadowingView').style.display = 'none';
    document.getElementById('readingView').style.display = '';
    document.getElementById('readingBottomBar').style.display = '';
    document.getElementById('modeToggleBtn').textContent = '跟读 →';
    document.getElementById('backBtn').setAttribute('onclick', 'history.back()');
    updateTitle('阅读');
    cleanupShadowing();
  }
}

// Save progress when leaving page
window.addEventListener('pagehide', () => {
  if (isShadowingMode && typeof saveProgress === 'function') saveProgress();
});

loadReading();
