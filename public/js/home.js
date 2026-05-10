/* ===========================
   home.js — Home page logic
   =========================== */

async function loadHome() {
  const grid = document.getElementById('cardGrid');
  try {
    const data = await fetchJSON(API.scripts);
    if (!data.scripts.length) {
      grid.innerHTML = '<p style="text-align:center;color:var(--text-light);grid-column:1/-1;">暂无导游词数据</p>';
      return;
    }
    // 按句子数量从高到低排序
    data.scripts.sort((a, b) => (b.sentence_count || 0) - (a.sentence_count || 0));
    grid.innerHTML = data.scripts.map((s, idx) => `
      <div class="scenic-card scenic-${s.id}" onclick='openScenic(${JSON.stringify(s.id)})' style="animation-delay:${idx * 0.1}s">
        <div class="card-gold-top"></div>
        <div class="card-corners"></div>
        <div class="card-gloss"></div>
        <div class="card-titles">
          <div class="card-zh">${escapeHTML(s.title_zh)}</div>
          <div class="card-en">${escapeHTML(s.title_en)}</div>
        </div>
        <div class="card-desc">${escapeHTML(s.description || '')}</div>
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

async function loadQuote() {
  const el = document.getElementById('dailyQuote');
  try {
    const data = await fetchJSON(API.quote);
    el.innerHTML = `
      <div class="quote-en">${escapeHTML(data.en)}</div>
      <div class="quote-zh">${escapeHTML(data.zh)}</div>
    `;
  } catch (err) {
    el.innerHTML = '';
    console.error('Failed to load quote:', err);
  }
}

loadHome();
loadQuote();
