/* ===========================
   common.js — Shared utilities
   =========================== */

const API = {
  scripts:  '/api/scripts',
  script:   (id) => `/api/scripts/${id}`,
  ai:       '/api/ai',
  stt:      '/api/stt',
  quote:    '/api/quote',
};

// Convert audio blob to 16kHz mono WAV for ASR
async function blobToWav(audioBlob) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();

  // Resample to 16kHz mono
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * 16000), 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const rendered = await offlineCtx.startRendering();

  return new Blob([audioBufferToWav(rendered)], { type: 'audio/wav' });
}

function audioBufferToWav(buffer) {
  const numChannels = 1, sampleRate = buffer.sampleRate, bitsPerSample = 16;
  const data = buffer.getChannelData(0);
  const dataLength = data.length * (bitsPerSample / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const wav = new ArrayBuffer(totalLength);
  const view = new DataView(wav);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);       // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
  view.setUint16(32, numChannels * bitsPerSample / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return wav;
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

async function fetchJSON(url, options = {}) {
  const defaults = { headers: { 'Content-Type': 'application/json' } };
  const resp = await fetch(url, { ...defaults, ...options });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
  return resp.json();
}

// Get URL query param
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Escape HTML to prevent XSS
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Tokenize English text to lowercase words (for diff comparison)
function tokenizeWords(text) {
  return text.replace(/[.,!?;:]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
}
