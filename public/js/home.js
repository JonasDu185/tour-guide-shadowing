/* ===========================
   home.js — Home page logic
   =========================== */

const ICONS = {
  gugong: '🏯',
  tiantan: '🌿',
  yiheyuan: '🌸',
  shisanling: '🏛',
  changcheng: '🧱',
  damen: '🏛',
};

async function loadHome() {
  const grid = document.getElementById('cardGrid');
  try {
    const data = await fetchJSON(API.scripts);
    if (!data.scripts.length) {
      grid.innerHTML = '<p style="text-align:center;color:var(--text-light);grid-column:1/-1;">暂无导游词数据</p>';
      return;
    }
    grid.innerHTML = data.scripts.map(s => `
      <div class="scenic-card" onclick="openScenic('${s.id}')">
        <div class="card-icon">${ICONS[s.id] || '📍'}</div>
        <div class="card-zh">${escapeHTML(s.title_zh)}</div>
        <div class="card-en">${escapeHTML(s.title_en)}</div>
        <span class="card-count">${s.sentence_count || 0} 句</span>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<p style="text-align:center;color:var(--primary);grid-column:1/-1;">加载失败，请确认服务已启动</p>';
    console.error('Failed to load scripts:', err);
  }
}

function openScenic(id) {
  window.location.href = `/scenic.html?id=${id}`;
}

loadHome();
