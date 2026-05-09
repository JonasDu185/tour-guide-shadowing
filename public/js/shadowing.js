/* ===========================
   shadowing.js — Shadowing mode
   Sentence-level: listen, record, ASR compare
   =========================== */

let sentences = [];
let currentIdx = 0;
let mediaRecorder = null;
let recordedChunks = [];
let recordingBlob = null;
let ttsState = 'idle';
let speedIdx = 0;
const SPEEDS = [1, 0.75, 1.25];
const STORAGE_KEY = 'shadowing_progress';

const ttsAudio = document.getElementById('ttsAudio');
const recordingAudio = document.getElementById('recordingAudio');

// ---------- Init / Cleanup ----------

function initShadowing() {
  if (!currentScript) return;
  sentences = currentScript.sentences || [];
  if (!sentences.length) {
    document.getElementById('sentenceCard').innerHTML =
      '<p style="text-align:center;color:var(--text-light);padding:40px;">暂无跟读数据</p>';
    return;
  }
  const saved = loadProgress();
  currentIdx = (saved >= 0 && saved < sentences.length) ? saved : 0;
  updateTitle('跟读');
  renderSentence();
  updateNavButtons();
}

function cleanupShadowing() {
  saveProgress();
  stopTTS();
  stopRecording();
  if (recordingBlob) URL.revokeObjectURL(recordingBlob);
  recordingBlob = null;
  document.getElementById('recordingSection').style.display = 'none';
  document.getElementById('comparisonSection').style.display = 'none';
}

// ---------- Progress Persistence ----------

function saveProgress() {
  if (currentScript) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      scriptId: currentScript.id, index: currentIdx,
    }));
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return -1;
    const data = JSON.parse(raw);
    if (data.scriptId === currentScript.id) return data.index;
  } catch { /* localStorage 解析失败，忽略 */ }
  return -1;
}

// ---------- Sentence Display ----------

function renderSentence() {
  if (!sentences.length) return;
  const s = sentences[currentIdx];
  document.getElementById('sentenceEn').textContent = s.en;

  // Section 面包屑
  const sectionEl = document.getElementById('sentenceSection');
  const heading = s.heading_en || s.heading_zh || '';
  if (heading) {
    sectionEl.innerHTML = '<span class="section-breadcrumb">' + escapeHTML(heading) + '</span>';
    sectionEl.style.display = '';
  } else {
    sectionEl.style.display = 'none';
  }

  // 中文改为完整段落上下文
  const zhEl = document.getElementById('sentenceZh');
  const contextZh = s.zh || '';
  if (contextZh) {
    zhEl.textContent = contextZh;
    zhEl.className = 'sentence-zh sentence-context';
  } else {
    zhEl.textContent = '';
    zhEl.className = 'sentence-zh';
  }

  document.getElementById('shadowProgress').textContent =
    `${currentIdx + 1} / ${sentences.length}`;

  hideRecording();
  hideComparison();
  stopTTS();
  updateNavButtons();
  saveProgress();
}

function updateNavButtons() {
  document.getElementById('btnPrev').disabled = currentIdx <= 0;
  document.getElementById('btnNext').disabled = currentIdx >= sentences.length - 1;
}

function prevSentence() { if (currentIdx > 0) { currentIdx--; renderSentence(); } }
function nextSentence() { if (currentIdx < sentences.length - 1) { currentIdx++; renderSentence(); } }

function jumpToSentence(index) {
  if (index >= 0 && index < sentences.length) { currentIdx = index; renderSentence(); closeSentenceList(); }
}

// ---------- Sentence List Modal ----------

function openSentenceList() {
  if (!sentences.length) return;
  let html = '<div class="sentence-list-overlay" onclick="closeSentenceList()">';
  html += '<div class="sentence-list-panel" onclick="event.stopPropagation()">';
  html += '<div class="sentence-list-header">';
  html += `<h3>${currentScript.title_zh} · 全部句子</h3>`;
  html += '<button class="sentence-list-close" onclick="closeSentenceList()">✕</button>';
  html += '</div><div class="sentence-list-body">';
  let lastHeading = '';
  sentences.forEach((s, i) => {
    const active = i === currentIdx ? ' active' : '';
    const heading = s.heading_en || s.heading_zh || '';
    // 标题变化时插入分隔
    let headingHTML = '';
    if (heading && heading !== lastHeading) {
      headingHTML = `<div class="sentence-list-heading">${escapeHTML(heading)}</div>`;
      lastHeading = heading;
    }
    html += headingHTML;
    html += `<div class="sentence-list-item${active}" onclick="jumpToSentence(${i})">`;
    html += `<span class="sentence-list-num">${i + 1}</span>`;
    html += `<span class="sentence-list-text">${escapeHTML(s.en.slice(0, 80))}${s.en.length > 80 ? '...' : ''}</span>`;
    html += '</div>';
  });
  html += '</div></div></div>';
  const overlay = document.createElement('div');
  overlay.id = 'sentenceListModal';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

function closeSentenceList() { const el = document.getElementById('sentenceListModal'); if (el) el.remove(); }

// ---------- TTS Playback ----------

async function playOriginal() {
  if (ttsState === 'playing') { stopTTS(); return; }
  if (ttsState !== 'idle') return;  // loading 中不响应
  const s = sentences[currentIdx];
  if (!s) return;

  const scriptId = currentScript.id;
  const idx = currentIdx;
  const cacheUrl = `/api/tts/${scriptId}/${idx}`;

  ttsState = 'loading'; updateTTSButton();
  try {
    let resp = await fetch(cacheUrl);
    if (!resp.ok) {
      resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: s.en, scriptId, index: idx }),
      });
      if (!resp.ok) throw new Error('TTS generation failed');
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    ttsAudio.src = url;
    ttsAudio.playbackRate = SPEEDS[speedIdx];
    ttsAudio.onplay = () => { ttsState = 'playing'; updateTTSButton(); };
    ttsAudio.onended = () => { ttsState = 'idle'; URL.revokeObjectURL(url); updateTTSButton(); };
    ttsAudio.onpause = () => {
      if (ttsAudio.currentTime > 0 && !ttsAudio.ended) { ttsState = 'idle'; ttsAudio.currentTime = 0; updateTTSButton(); }
    };
    ttsAudio.play();
  } catch (err) {
    console.error('TTS error:', err);
    ttsState = 'idle'; updateTTSButton();
  }
}

function onTTSEnded() { ttsState = 'idle'; updateTTSButton(); }
function stopTTS() { ttsAudio.pause(); ttsAudio.currentTime = 0; ttsState = 'idle'; updateTTSButton(); }

function updateTTSButton() {
  const btn = document.getElementById('btnPlay');
  const label = btn.querySelector('.btn-label');
  if (ttsState === 'loading') { label.textContent = '生成中...'; btn.disabled = true; }
  else if (ttsState === 'playing') { label.textContent = '⏹ 停止'; btn.disabled = false; }
  else { label.textContent = '听原音'; btn.disabled = false; }
}

// ---------- Speed Control ----------

function cycleSpeed() {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  document.getElementById('speedBtn').textContent = SPEEDS[speedIdx] + '×';
  ttsAudio.playbackRate = SPEEDS[speedIdx];
}

// ---------- Recording ----------

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
}

function getSupportedMimeType() {
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      recordingBlob = new Blob(recordedChunks, { type: mimeType || 'audio/mp4' });
      showRecordingPlayback();
      // Auto-run ASR after recording
      await runASR();
    };

    mediaRecorder.start();
    updateRecordingUI(true);
  } catch (err) {
    console.error('Recording error:', err);
    alert('无法访问麦克风，请检查权限设置');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    updateRecordingUI(false);
  }
}

function updateRecordingUI(recording) {
  const btn = document.getElementById('btnRecord');
  const label = document.getElementById('btnRecordLabel');
  if (recording) { label.textContent = '停止'; btn.classList.add('recording'); }
  else { label.textContent = '录音'; btn.classList.remove('recording'); }
}

function showRecordingPlayback() {
  if (!recordingBlob) return;
  const url = URL.createObjectURL(recordingBlob);
  recordingAudio.src = url;
  document.getElementById('recordingSection').style.display = '';
}

function hideRecording() {
  document.getElementById('recordingSection').style.display = 'none';
  if (recordingBlob) { URL.revokeObjectURL(recordingBlob); recordingBlob = null; }
  recordingAudio.src = '';
  updateRecordingUI(false);
}

// ---------- ASR (Speech-to-Text) ----------

async function runASR() {
  if (!recordingBlob) return;

  const section = document.getElementById('comparisonSection');
  const content = document.getElementById('comparisonContent');
  section.style.display = '';
  content.innerHTML = '<div class="comparison-loading">🔍 正在识别语音...</div>';

  try {
    // Convert browser audio blob to 16kHz WAV
    const wavBlob = await blobToWav(recordingBlob);

    // Base64 encode and send to backend
    const reader = new FileReader();
    const base64 = await new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(wavBlob);
    });

    const resp = await fetch(API.stt, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64 }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `ASR HTTP ${resp.status}`);
    }

    const data = await resp.json();
    showComparison(data.text || '');
  } catch (err) {
    console.error('ASR error:', err);
    content.innerHTML = `<div class="comparison-error">识别失败：${escapeHTML(err.message)}</div>`;
  }
}

function showComparison(recognized) {
  const content = document.getElementById('comparisonContent');
  const original = sentences[currentIdx].en;

  // Simple word-level diff
  const origWords = tokenizeWords(original);
  const recWords = tokenizeWords(recognized);

  // Build diff using LCS-like approach
  const diff = buildDiff(origWords, recWords);

  let origHTML = '<div class="diff-line"><span class="diff-label">📄 原文</span><p>';
  let recHTML = '<div class="diff-line"><span class="diff-label">🎙 你说</span><p>';
  let errorCount = 0;

  for (const d of diff) {
    if (d.type === 'match') {
      origHTML += `<span class="diff-match">${escapeHTML(d.word)} </span>`;
      recHTML += `<span class="diff-match">${escapeHTML(d.word)} </span>`;
    } else if (d.type === 'delete') {
      origHTML += `<span class="diff-miss">${escapeHTML(d.word)} </span>`;
      recHTML += `<span class="diff-gap">_ </span>`;
      errorCount++;
    } else if (d.type === 'insert') {
      origHTML += `<span class="diff-gap">_ </span>`;
      recHTML += `<span class="diff-extra">${escapeHTML(d.word)} </span>`;
      errorCount++;
    } else if (d.type === 'replace') {
      origHTML += `<span class="diff-miss">${escapeHTML(d.oldWord || d.word)} </span>`;
      recHTML += `<span class="diff-extra">${escapeHTML(d.newWord || d.word)} </span>`;
      errorCount++;
    }
  }

  origHTML += '</p></div>';
  recHTML += '</p></div>';

  const summary = errorCount === 0
    ? '<div class="diff-summary diff-perfect">✅ 完美！跟原文完全一致</div>'
    : `<div class="diff-summary diff-errors">🔴 ${errorCount} 处差异</div>`;

  content.innerHTML = summary + origHTML + recHTML;
}

function buildDiff(orig, rec) {
  // Simple LCS-based diff
  const m = orig.length, n = rec.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = orig[i - 1] === rec[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);

  // Backtrack
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
      // Check if this deletion is followed by an insertion (replace)
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

function hideComparison() {
  document.getElementById('comparisonSection').style.display = 'none';
  document.getElementById('comparisonContent').innerHTML = '';
}
