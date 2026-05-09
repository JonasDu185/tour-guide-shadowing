require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '5mb' }));

// JS/CSS/SW 禁止缓存，确保手机端总是拿到最新版本
app.use((req, res, next) => {
  if (/\.(js|css)$/.test(req.path) || req.path === '/sw.js') {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const tls = require('tls');

const DATA_DIR = path.join(__dirname, 'data');

// 校验 ID 只包含安全字符，防止路径遍历
function isValidId(id) {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(id);
}
const CACHE_DIR = path.join(__dirname, 'cache');
const TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const ARK_KEY = process.env.ARK_API_KEY;  // 火山方舟 API Key（豆包模型）
const ARK_MODEL = process.env.ARK_MODEL || 'ep-20260509013108-hhw96';  // Doubao-lite 接入点
// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ---------- API Routes ----------

// List all scripts (id + titles only)
app.get('/api/scripts', (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return res.json({ scripts: [] });
    }
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const scripts = files.map(f => {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8');
      const data = JSON.parse(raw);
      return { id: data.id, title_zh: data.title_zh, title_en: data.title_en, sentence_count: (data.sentences || []).length };
    });
    res.json({ scripts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list scripts' });
  }
});

// Get a single script by id
app.get('/api/scripts/:id', (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid script id' });
    }
    const filePath = path.join(DATA_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Script not found' });
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load script' });
  }
});

// ---------- AI 工具函数 ----------

function detectTextType(text) {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  const wc = words.length;
  const endsWithPunct = /[.!?]$/.test(trimmed);
  if (!endsWithPunct && wc <= 2) return 'word';
  if (endsWithPunct || wc >= 6) return 'sentence';
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

// AI 翻译 / 语法分析 / 追问（豆包 Lite）
app.post('/api/ai', async (req, res) => {
  const { text, action, question, context } = req.body;

  if (!text || typeof text !== 'string' || text.length > 3000) {
    return res.status(400).json({ error: 'text 无效或过长' });
  }
  const act = ['translate', 'grammar', 'chat'].includes(action) ? action : 'translate';

  if (!ARK_KEY) {
    return res.status(500).json({ error: 'ARK_API_KEY 未配置' });
  }

  try {
    const systemPrompt = buildSystemPrompt(act, text.trim());
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    if (act === 'chat') {
      if (context) messages.push({ role: 'user', content: `我正在读这句话："${context}"` });
      messages.push({ role: 'user', content: question || text });
    } else {
      messages.push({ role: 'user', content: text.trim() });
    }

    // 全部关闭推理模式，速度快
    const body = {
      model: ARK_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: act === 'translate' ? 300 : 300,
      thinking: { type: 'disabled' },
    };
    const timeout = act === 'translate' ? 15000 : 30000;

    const aiRes = await axios.post(ARK_URL, body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_KEY}`,
      },
      timeout,
    });

    const content = aiRes.data?.choices?.[0]?.message?.content || '';
    const usage = aiRes.data?.usage || {};

    res.json({
      text: text.trim(),
      action: act,
      result: content,
      textType: detectTextType(text),
      usage: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('AI error:', detail);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 请求失败', detail });
    }
  }
});

// 尝试从缓存返回音频，成功返回 true
function serveCachedAudio(scriptId, index, res) {
  const cacheFile = path.join(CACHE_DIR, `${scriptId}_${index}.mp3`);
  if (fs.existsSync(cacheFile)) {
    res.set({ 'Content-Type': 'audio/mpeg', 'X-Cache': 'HIT' });
    const stream = fs.createReadStream(cacheFile);
    stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'Stream error' }); });
    stream.pipe(res);
    return true;
  }
  return false;
}

// GET /api/tts/:scriptId/:index — 获取缓存音频
app.get('/api/tts/:scriptId/:index', (req, res) => {
  if (!isValidId(req.params.scriptId)) return res.status(400).json({ error: 'Invalid scriptId' });
  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx > 9999) return res.status(400).json({ error: 'Invalid index' });
  if (!serveCachedAudio(req.params.scriptId, idx, res)) {
    res.status(404).json({ error: 'Not cached yet' });
  }
});

// POST /api/tts — 生成新音频并缓存
app.post('/api/tts', async (req, res) => {
  try {
    const { text, scriptId, index } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    if (scriptId !== undefined && index !== undefined && isValidId(String(scriptId))) {
      if (serveCachedAudio(scriptId, index, res)) return;
    }

    const apiKey = process.env.VOLC_API_KEY;
    const resourceId = process.env.VOLC_RESOURCE_ID || 'seed-tts-2.0';
    const speaker = process.env.VOLC_SPEAKER;

    if (!apiKey) return res.status(500).json({ error: 'missing VOLC_API_KEY' });
    if (!speaker) return res.status(500).json({ error: 'missing VOLC_SPEAKER' });

    console.log(`TTS: script=${scriptId || '?'} idx=${index ?? '?'} len=${text.length}`);

    const ttsRes = await axios.post(TTS_URL, {
      user: { uid: 'tour-guide-app' },
      req_params: {
        text,
        speaker,
        audio_params: { format: 'mp3', sample_rate: 24000 },
      },
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': crypto.randomUUID(),
      },
      responseType: 'text',
      timeout: 30000,
    });

    // Parse NDJSON response, decode base64 chunks, concat
    const lines = ttsRes.data.trim().split('\n');
    const chunks = [];
    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.code === 20000000) break;
      if (obj.data) chunks.push(Buffer.from(obj.data, 'base64'));
    }

    if (chunks.length === 0) {
      return res.status(500).json({ error: 'No audio data received' });
    }

    const audio = Buffer.concat(chunks);
    console.log(`TTS done: ${chunks.length} chunks, ${audio.length} bytes`);

    // Cache to disk
    if (scriptId !== undefined && index !== undefined) {
      const cacheFile = path.join(CACHE_DIR, `${scriptId}_${index}.mp3`);
      fs.writeFileSync(cacheFile, audio);
    }

    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
    res.send(audio);
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('TTS error:', detail);
    if (!res.headersSent) {
      res.status(500).json({ error: 'TTS request failed', detail });
    }
  }
});

// -------- V3 Binary Protocol Helpers --------

function buildAsrFrame(payload, { msgType = 0x10, flags = 0x00 }) {
  const buf = Buffer.alloc(8);
  buf[0] = 0x11; // version=1, headerSize=1(×4)
  buf[1] = (msgType & 0xF0) | (flags & 0x0F);
  buf[2] = 0x10; // serialization=JSON, compression=none
  buf[3] = 0x00;
  buf.writeUInt32BE(payload.length, 4);
  return Buffer.concat([buf, payload]);
}

function parseAsrFrame(data) {
  if (data.length < 8) return null;
  const msgType = data[1] & 0xF0;
  const flags = data[1] & 0x0F;

  let offset = 4; // after 4-byte header

  // Server response has a 4-byte sequence number when flags indicate
  const hasSeq = (flags & 0x01) !== 0;
  if (hasSeq) offset += 4; // skip sequence number

  if (data.length < offset + 4) return null;
  const size = data.readUInt32BE(offset);
  offset += 4;
  if (data.length < offset + size) return null;
  return { msgType, flags, payload: data.slice(offset, offset + size) };
}

// -------- Minimal WebSocket Client (no UTF-8 validation) --------

function wsConnect(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isTls = u.protocol === 'wss:';
    const port = u.port || (isTls ? 443 : 80);
    const host = u.hostname;
    const path = u.pathname + u.search;

    const key = crypto.randomBytes(16).toString('base64');

    const reqHeaders = [
      `GET ${path} HTTP/1.1`,
      `Host: ${host}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: 13`,
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      '', '',
    ].join('\r\n');

    const connect = isTls
      ? () => tls.connect(port, host, { servername: host })
      : () => require('net').connect(port, host);

    const socket = connect();
    socket.on('connect', () => socket.write(reqHeaders));

    let handshakeBuffer = '';
    socket.on('data', (data) => {
      handshakeBuffer += data.toString();
      if (handshakeBuffer.includes('\r\n\r\n')) {
        const [header, ...rest] = handshakeBuffer.split('\r\n\r\n');
        const statusLine = header.split('\r\n')[0];
        if (!statusLine.includes('101')) {
          socket.destroy();
          return reject(new Error(`WebSocket upgrade failed: ${statusLine}`));
        }
        // Return raw socket + any leftover data
        const leftover = Buffer.from(rest.join('\r\n\r\n'));
        resolve({ socket, leftover });
      }
    });
    socket.on('error', reject);
    setTimeout(() => { socket.destroy(); reject(new Error('WebSocket connect timeout')); }, 10000);
  });
}

function wsSend(socket, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
  const opcode = Buffer.isBuffer(data) ? 0x02 : 0x01; // binary or text
  const len = payload.length;
  const maskKey = crypto.randomBytes(4);

  let frame;
  if (len < 126) {
    frame = Buffer.alloc(2);
    frame[0] = 0x80 | opcode; // FIN + opcode
    frame[1] = 0x80 | len;    // MASK + length
  } else if (len < 65536) {
    frame = Buffer.alloc(4);
    frame[0] = 0x80 | opcode;
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(len, 2);
  } else {
    frame = Buffer.alloc(10);
    frame[0] = 0x80 | opcode;
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(len), 2);
  }

  // Mask payload
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ maskKey[i % 4];

  socket.write(Buffer.concat([frame, maskKey, masked]));
}

function createFrameReader(socket) {
  let buffer = Buffer.alloc(0);
  let resolver = null;
  let timer = null;

  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    tryRead();
  });

  function tryRead() {
    if (!resolver) return; // no pending read

    while (resolver && buffer.length >= 2) {
      const opcode = buffer[0] & 0x0F;
      const masked = (buffer[1] & 0x80) !== 0;
      let payloadLen = buffer[1] & 0x7F;
      let headerLen = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        headerLen = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        headerLen = 10;
      }

      const maskLen = masked ? 4 : 0;
      const totalLen = headerLen + maskLen + payloadLen;
      if (buffer.length < totalLen) return; // not enough data yet

      // Extract frame
      let offset = headerLen;
      const maskKey = masked ? buffer.slice(offset, offset + 4) : null;
      offset += maskLen;

      const payload = buffer.slice(offset, offset + payloadLen);
      if (masked) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
      }

      // Remove consumed bytes from buffer
      buffer = buffer.slice(totalLen);

      const resolve = resolver;
      clearTimeout(timer);
      resolver = null;
      timer = null;

      if (opcode === 0x08) {
        resolve(null); // connection closed
      } else {
        resolve({ opcode, payload, isText: opcode === 0x01 });
      }
    }
  }

  return function readFrame(timeout = 30000) {
    return new Promise((resolve, reject) => {
      resolver = resolve;
      timer = setTimeout(() => {
        resolver = null;
        reject(new Error('WS read timeout'));
      }, timeout);
      // Try to read immediately if data already in buffer
      tryRead();
    });
  };
}

// ---------- ASR via raw WebSocket ----------

const ASR_WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';

app.post('/api/stt', async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'audio (base64 WAV) is required' });

    // Use V3 API Key (same as TTS) + model 2.0 resource
    const apiKey = process.env.VOLC_API_KEY;
    const resourceId = 'volc.seedasr.sauc.duration';

    if (!apiKey) return res.status(500).json({ error: 'missing VOLC_API_KEY' });

    console.log(`ASR: audio_base64_len=${audio.length} resource=${resourceId}`);

    // Decode WAV to raw PCM
    const wavBuffer = Buffer.from(audio, 'base64');
    const pcmBuffer = wavBuffer.slice(44);

    // Connect via raw WebSocket (new console: X-Api-Key only)
    const { socket } = await wsConnect(ASR_WS_URL, {
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': crypto.randomUUID(),
      'X-Api-Sequence': '-1',
    });
    console.log('ASR WebSocket connected (V3 bigmodel_nostream)');

    // Step 1: Full Client Request (msgType=0x10, flags=0x00)
    wsSend(socket, buildAsrFrame(Buffer.from(JSON.stringify({
      user: { uid: 'tour-guide-app' },
      audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1, language: 'en-US' },
      request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true },
    })), { msgType: 0x10, flags: 0x00 }));

    // Step 2: Send audio chunks (msgType=0x20, ~100ms per chunk)
    const chunkSize = 3200; // 100ms at 16kHz 16-bit mono
    for (let offset = 0; offset < pcmBuffer.length; offset += chunkSize) {
      const chunk = pcmBuffer.slice(offset, Math.min(offset + chunkSize, pcmBuffer.length));
      wsSend(socket, buildAsrFrame(chunk, { msgType: 0x20, flags: 0x00 }));
      await new Promise(r => setTimeout(r, 10));
    }

    // Step 3: Last packet (msgType=0x20, flags=0x02 = negative/last)
    wsSend(socket, buildAsrFrame(Buffer.alloc(0), { msgType: 0x20, flags: 0x02 }));

    // Read server responses with proper buffering
    const readFrame = createFrameReader(socket);
    let finalText = '';
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const frame = await readFrame(5000);
      if (!frame) break;

      // Try to parse the WebSocket payload as a binary ASR frame
      const parsed = parseAsrFrame(frame.payload);
      if (parsed) {
        try {
          const msg = JSON.parse(parsed.payload.toString());
          console.log('ASR response:', JSON.stringify(msg).slice(0, 300));
          if (msg.result?.text !== undefined) {
            finalText = msg.result.text;
          }
          if (msg.payload_msg?.result) {
            finalText = msg.payload_msg.result.map(r => r.text || '').join(' ').trim();
          }
        } catch (e) {
          console.log('ASR JSON parse err:', e.message);
        }
      } else {
        try {
          const msg = JSON.parse(frame.payload.toString());
          console.log('ASR plain:', JSON.stringify(msg).slice(0, 300));
          if (msg.text) finalText = msg.text;
        } catch { /* plain text frame, ignore */ }
      }
    }

    socket.destroy();
    console.log(`ASR result: "${finalText}"`);
    res.json({ text: finalText });

  } catch (err) {
    console.error('ASR error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'ASR request failed', detail: err.message });
    }
  }
});

// Serve data JSON files directly via static
app.use('/data', express.static(DATA_DIR));

// 健康检查端点（云平台监控用）
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---------- Start Server (本地 HTTPS / 云端 HTTP 双模式) ----------
const PORT = process.env.PORT || 3443;
const HTTP_PORT = process.env.HTTP_PORT || 3000;

const certKey = path.join(__dirname, 'cert.key');
const certCrt = path.join(__dirname, 'cert.crt');
const useHttps = fs.existsSync(certKey) && fs.existsSync(certCrt);

if (useHttps) {
  // 本地开发：自签证书 HTTPS + HTTP 重定向
  const sslOptions = {
    key: fs.readFileSync(certKey),
    cert: fs.readFileSync(certCrt),
  };
  https.createServer(sslOptions, app).listen(PORT, () => {
    console.log(`HTTPS: https://localhost:${PORT}`);
  });
  http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host?.replace(/:3000/, ':3443') || 'localhost:3443'}${req.url}` });
    res.end();
  }).listen(HTTP_PORT, () => {
    console.log(`HTTP:  http://localhost:${HTTP_PORT} → redirect to HTTPS`);
  });
} else {
  // 云端部署：纯 HTTP，HTTPS 由反向代理（Caddy/Nginx）处理
  app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
  });
}
