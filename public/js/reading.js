/* ===========================
   reading.js — Reading mode + word-click dictionary
   =========================== */

let currentScript = null;
let currentWordEl = null;
let dictAudio = null;
let isShadowingMode = false;

// Popover elements
const popover = document.getElementById('popover');
const popWord = document.getElementById('popWord');
const popPhonetic = document.getElementById('popPhonetic');
const popMeanings = document.getElementById('popMeanings');
const popAudioBtn = document.getElementById('popAudioBtn');

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
      <p class="para-en">${makeWordsClickable(p.en)}</p>
      <p class="para-zh">${escapeHTML(p.zh)}</p>
    </div>
    ${i < currentScript.paragraphs.length - 1 ? '<hr class="para-divider">' : ''}
  `).join('');
  container.innerHTML = html;

  // Attach click handlers to all words
  container.querySelectorAll('.word').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onWordClick(el);
    });
  });
}

function makeWordsClickable(text) {
  return escapeHTML(text).replace(/([A-Za-z]+(?:[''][A-Za-z]+)?)/g, '<span class="word">$1</span>');
}

// ---------- Dictionary Popover ----------

async function onWordClick(el) {
  const word = el.textContent.trim().toLowerCase();

  if (currentWordEl === el && popover.style.display === 'block') {
    hidePopover();
    return;
  }

  if (currentWordEl) currentWordEl.classList.remove('active');
  currentWordEl = el;
  el.classList.add('active');

  showPopover(el, { loading: true });

  try {
    const data = await fetchJSON(API.dict(word));
    showPopover(el, data.notFound ? { word, notFound: true } : data);
  } catch {
    hidePopover();
  }
}

function showPopover(el, data) {
  if (data.loading) {
    popWord.textContent = el.textContent.trim();
    popPhonetic.textContent = '';
    popMeanings.innerHTML = '<div class="popover-loading">查询中...</div>';
    popAudioBtn.style.display = 'none';
  } else if (data.notFound) {
    popWord.textContent = data.word;
    popPhonetic.textContent = '';
    popMeanings.innerHTML = '<div class="popover-notfound">未找到释义</div>';
    popAudioBtn.style.display = 'none';
  } else {
    popWord.textContent = data.word;
    popPhonetic.textContent = data.phonetic ? `/${data.phonetic}/` : '';
    let html = '';
    if (data.zhText) {
      html += `<div class="popover-meaning"><div class="popover-def popover-zh">${escapeHTML(data.zhText)}</div></div>`;
    }
    if (data.enDefinitions?.length) {
      html += data.enDefinitions.map(m => `
        <div class="popover-meaning">
          <div class="popover-pos">${m.partOfSpeech}</div>
          ${m.definitions.map(d => `<div class="popover-def">${escapeHTML(d)}</div>`).join('')}
        </div>
      `).join('');
    }
    popMeanings.innerHTML = html;
    popAudioBtn.style.display = data.audio ? '' : 'none';
    if (data.audio) {
      popAudioBtn.onclick = (e) => { e.stopPropagation(); playDictAudio(data.audio); };
    }
  }

  const rect = el.getBoundingClientRect();
  const popWidth = 260;
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;
  if (left + popWidth > window.innerWidth) left = window.innerWidth - popWidth - 8;
  if (left < 8) left = 8;
  if (rect.bottom + 200 > window.innerHeight) top = rect.top + window.scrollY - 200 - 6;

  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
  popover.style.display = 'block';
}

function hidePopover() {
  popover.style.display = 'none';
  if (currentWordEl) { currentWordEl.classList.remove('active'); currentWordEl = null; }
  stopDictAudio();
}

function playDictAudio(url) { stopDictAudio(); dictAudio = new Audio(url); dictAudio.play(); }
function stopDictAudio() { if (dictAudio) { dictAudio.pause(); dictAudio = null; } }

// ---------- Mode Toggle ----------

function toggleMode() {
  isShadowingMode = !isShadowingMode;
  if (isShadowingMode) {
    // Switch to shadowing
    document.getElementById('readingView').style.display = 'none';
    document.getElementById('readingBottomBar').style.display = 'none';
    document.getElementById('shadowingView').style.display = '';
    document.getElementById('modeToggleBtn').textContent = '阅读 ←';
    document.getElementById('backBtn').setAttribute('onclick', 'toggleMode()');
    hidePopover();
    initShadowing();
  } else {
    // Switch back to reading
    document.getElementById('shadowingView').style.display = 'none';
    document.getElementById('readingView').style.display = '';
    document.getElementById('readingBottomBar').style.display = '';
    document.getElementById('modeToggleBtn').textContent = '跟读 →';
    document.getElementById('backBtn').setAttribute('onclick', 'history.back()');
    updateTitle('阅读');
    cleanupShadowing();
  }
}

// Hide popover on outside clicks
document.addEventListener('click', (e) => {
  if (popover.style.display === 'block' && !popover.contains(e.target) && e.target !== currentWordEl) {
    hidePopover();
  }
});

// Save progress when leaving page
window.addEventListener('pagehide', () => {
  if (isShadowingMode && typeof saveProgress === 'function') saveProgress();
});

loadReading();
