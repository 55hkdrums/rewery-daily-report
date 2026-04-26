// ===== Brewery Daily Report - Main App =====
(function () {
  'use strict';

  // ===== Category Data =====
  const CATEGORIES = [
    {
      name: 'ビール仕込み補助', icon: '🍺', colorClass: 'card-beer', color: '#f5c542',
      items: ['麦芽粉砕', '麦芽粕取り', '麦芽受け入れ', '濾過', 'タンクのガス充填', '火入れ補助', 'タンク洗い補助']
    },
    {
      name: '出荷対応', icon: '🚚', colorClass: 'card-ship', color: '#8bc34a',
      items: ['デリコ出荷対応', '県販出荷対応', '個人出荷対応', '配達']
    },
    {
      name: 'ラベル貼り', icon: '🏷️', colorClass: 'card-label', color: '#9e9e9e',
      items: ['PETラベル貼り', '瓶ラベル貼り']
    },
    {
      name: '詰め作業', icon: '🫙', colorClass: 'card-fill', color: '#42a5f5',
      items: ['缶ビール', '瓶ビール', 'ビールPET', '日本酒']
    },
    {
      name: '売店', icon: '🏪', colorClass: 'card-shop', color: '#ab47bc',
      items: [] // 直接記録
    },
    {
      name: 'その他共通', icon: '📋', colorClass: 'card-other', color: '#e0e0e0',
      items: ['会議・打ち合わせ']
    }
  ];

  // ===== State =====
  let currentView = 'main';
  let timerInterval = null;
  let currentWorkStart = null;

  // ===== DOM References =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const views = {
    main: $('#view-main'),
    subcategory: $('#view-subcategory'),
    timeline: $('#view-timeline'),
    summary: $('#view-summary'),
    dashboard: $('#view-dashboard')
  };

  // ===== Init =====
  function init() {
    renderCategoryGrid();
    updateClock();
    setInterval(updateClock, 1000);
    checkCurrentWork();
    bindEvents();
    // Set today's date for timeline picker
    $('#timeline-date').value = todayStr();
  }

  // ===== Navigation =====
  function showView(name, title) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[name].classList.add('active');
    currentView = name;
    const backBtn = $('#btn-back');
    if (name === 'main') {
      backBtn.classList.add('hidden');
      $('#header-title').textContent = '🍺 醸造日報';
    } else {
      backBtn.classList.remove('hidden');
      $('#header-title').textContent = title || '🍺 醸造日報';
    }
  }

  // ===== Render Category Grid =====
  function renderCategoryGrid() {
    const grid = $('#category-grid');
    grid.innerHTML = CATEGORIES.map((cat, i) => `
      <button class="category-card ${cat.colorClass}" data-index="${i}" id="cat-${i}">
        <span class="card-icon">${cat.icon}</span>
        <span class="card-label">${cat.name}</span>
      </button>
    `).join('');
  }

  // ===== Render Subcategory =====
  function showSubcategory(catIndex) {
    const cat = CATEGORIES[catIndex];
    $('#subcategory-title').textContent = `${cat.icon} ${cat.name}`;
    $('#subcategory-title').style.color = cat.color;
    const grid = $('#subcategory-grid');
    grid.innerHTML = cat.items.map((item, i) => `
      <button class="subcategory-btn" data-cat="${catIndex}" data-item="${i}" id="sub-${catIndex}-${i}">
        <span class="sub-dot" style="background:${cat.color}"></span>
        ${item}
      </button>
    `).join('');
    showView('subcategory', cat.name);
  }

  // ===== Record Work =====
  async function recordWork(category, subcategory, color) {
    try {
      const res = await API.createRecord(category, subcategory, color);
      if (res.success) {
        showToast(res.message);
        showView('main');
        checkCurrentWork();
      }
    } catch (e) {
      showToast('記録に失敗しました');
    }
  }

  // ===== Check Current Work Status =====
  async function checkCurrentWork() {
    try {
      const res = await API.getRecords(todayStr());
      if (!res.success) return;
      const open = res.records.find(r => !r.end_time);
      const statusBar = $('#current-status');
      if (open) {
        statusBar.classList.remove('hidden');
        const label = open.subcategory ? `${open.category} - ${open.subcategory}` : open.category;
        $('#status-text').textContent = label;
        currentWorkStart = open.start_time;
        startTimer();
      } else {
        statusBar.classList.add('hidden');
        currentWorkStart = null;
        stopTimer();
      }
    } catch (e) { /* silent */ }
  }

  // ===== Timer =====
  function startTimer() {
    stopTimer();
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }
  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }
  function updateTimerDisplay() {
    if (!currentWorkStart) return;
    const [h, m] = currentWorkStart.split(':').map(Number);
    const now = new Date();
    const elapsed = Math.floor((now.getHours() * 60 + now.getMinutes()) - (h * 60 + m));
    const hrs = Math.floor(elapsed / 60);
    const mins = elapsed % 60;
    $('#status-timer').textContent = hrs > 0 ? `${hrs}時間${mins}分` : `${mins}分`;
  }

  // ===== Timeline =====
  async function showTimeline(date) {
    showView('timeline', '📋 タイムライン');
    $('#timeline-date').value = date || todayStr();
    await loadTimeline(date || todayStr());
  }

  async function loadTimeline(date) {
    try {
      const res = await API.getRecords(date);
      const list = $('#timeline-list');
      if (!res.success || res.records.length === 0) {
        list.innerHTML = '<div class="timeline-empty">この日の記録はありません</div>';
        return;
      }
      list.innerHTML = res.records.map(r => {
        const label = r.subcategory ? `${r.subcategory}` : r.category;
        const durText = r.duration_minutes != null ? `${Math.round(r.duration_minutes)}分` : '作業中...';
        const timeText = r.end_time ? `${r.start_time} → ${r.end_time}` : `${r.start_time} →`;
        return `
          <div class="timeline-item" data-id="${r.id}">
            <div class="tl-color" style="background:${r.color}"></div>
            <div class="tl-info">
              <div class="tl-category">${label}</div>
              <div class="tl-sub">${r.category}</div>
              <div class="tl-time">${timeText}</div>
            </div>
            <div class="tl-duration">${durText}</div>
          </div>
        `;
      }).join('');
    } catch (e) {
      $('#timeline-list').innerHTML = '<div class="timeline-empty">読み込みに失敗しました</div>';
    }
  }

  // ===== Edit Modal =====
  function openEditModal(recordId, startTime, endTime) {
    $('#edit-record-id').value = recordId;
    $('#edit-start-time').value = startTime;
    $('#edit-end-time').value = endTime || '';
    $('#edit-modal').classList.remove('hidden');
  }
  function closeEditModal() {
    $('#edit-modal').classList.add('hidden');
  }

  async function saveEdit() {
    const id = $('#edit-record-id').value;
    const startTime = $('#edit-start-time').value;
    const endTime = $('#edit-end-time').value || null;
    try {
      const res = await API.updateRecord(id, startTime, endTime);
      if (res.success) {
        showToast('修正しました');
        closeEditModal();
        loadTimeline($('#timeline-date').value);
        checkCurrentWork();
      }
    } catch (e) {
      showToast('更新に失敗しました');
    }
  }

  async function deleteRecord() {
    const id = $('#edit-record-id').value;
    showConfirm('この記録を削除しますか？', async () => {
      try {
        const res = await API.deleteRecord(id);
        if (res.success) {
          showToast('削除しました');
          closeEditModal();
          loadTimeline($('#timeline-date').value);
          checkCurrentWork();
        }
      } catch (e) {
        showToast('削除に失敗しました');
      }
    });
  }

  // ===== End Work =====
  async function endWork() {
    showConfirm('退勤しますか？\n本日の作業を集計します。', async () => {
      try {
        const res = await API.endWork();
        if (res.success) {
          renderSummary(res);
          checkCurrentWork();
        }
      } catch (e) {
        showToast('退勤処理に失敗しました');
      }
    });
  }

  function renderSummary(data) {
    $('#summary-date').textContent = `📅 ${data.date}　退勤: ${data.endTime}`;
    const totalH = Math.floor(data.totalMinutes / 60);
    const totalM = Math.round(data.totalMinutes % 60);
    $('#summary-total').textContent = `合計 ${totalH}時間${totalM}分`;

    const maxMin = Math.max(...data.summary.map(s => s.total_minutes || 0), 1);
    $('#summary-list').innerHTML = data.summary.map(s => {
      const label = s.subcategory ? `${s.category} - ${s.subcategory}` : s.category;
      const mins = Math.round(s.total_minutes || 0);
      const pct = ((s.total_minutes || 0) / maxMin * 100).toFixed(0);
      return `
        <div class="summary-item">
          <span class="sum-color" style="background:${s.color}"></span>
          <span class="sum-name">${label}</span>
          <span class="sum-time">${mins}分</span>
        </div>
        <div class="sum-bar-wrap"><div class="sum-bar" style="width:${pct}%;background:${s.color}"></div></div>
      `;
    }).join('');

    // Timeline in summary
    $('#summary-timeline').innerHTML = `<h3>📋 本日のタイムライン</h3>` +
      data.records.map(r => {
        const label = r.subcategory ? `${r.subcategory}` : r.category;
        const durText = r.duration_minutes != null ? `${Math.round(r.duration_minutes)}分` : '';
        return `
          <div class="timeline-item" style="cursor:default; margin-bottom:6px;">
            <div class="tl-color" style="background:${r.color}"></div>
            <div class="tl-info">
              <div class="tl-category">${label}</div>
              <div class="tl-time">${r.start_time} → ${r.end_time || '---'}</div>
            </div>
            <div class="tl-duration">${durText}</div>
          </div>
        `;
      }).join('');

    showView('summary', '🏠 退勤');
  }

  // ===== Dashboard =====
  async function showDashboard() {
    showView('dashboard', '📊 分析');
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    $('#dashboard-month').value = monthStr;
    loadDashboard('all');
  }

  async function loadDashboard(tab) {
    const content = $('#dashboard-content');
    content.innerHTML = '<div class="dash-empty">読み込み中...</div>';
    try {
      let res;
      if (tab === 'all') {
        res = await API.getAverages();
      } else {
        const month = $('#dashboard-month').value;
        res = await API.getMonthlyAverages(month);
      }
      if (!res.success || (!res.averages || res.averages.length === 0)) {
        content.innerHTML = '<div class="dash-empty">データがありません</div>';
        return;
      }
      const maxAvg = Math.max(...res.averages.map(a => a.avg_minutes || 0), 1);
      content.innerHTML = res.averages.map(a => {
        const label = a.subcategory ? `${a.category} - ${a.subcategory}` : a.category;
        const pct = ((a.avg_minutes || 0) / maxAvg * 100).toFixed(0);
        return `
          <div class="dash-card">
            <div class="dash-card-header">
              <span class="dash-dot" style="background:${a.color}"></span>
              <span class="dash-card-title">${label}</span>
            </div>
            <div class="dash-stats">
              <div class="dash-stat">
                <div class="dash-stat-value">${a.avg_minutes}分</div>
                <div class="dash-stat-label">平均</div>
              </div>
              <div class="dash-stat">
                <div class="dash-stat-value">${a.min_minutes}分</div>
                <div class="dash-stat-label">最短</div>
              </div>
              <div class="dash-stat">
                <div class="dash-stat-value">${a.max_minutes}分</div>
                <div class="dash-stat-label">最長</div>
              </div>
            </div>
            <div class="dash-bar-container">
              <div class="dash-bar-bg"><div class="dash-bar-fill" style="width:${pct}%;background:${a.color}"></div></div>
              <div class="dash-bar-labels"><span>回数: ${a.total_count}回</span><span>合計: ${a.total_minutes}分</span></div>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      content.innerHTML = '<div class="dash-empty">読み込みに失敗しました</div>';
    }
  }

  // ===== Toast =====
  function showToast(msg) {
    const toast = $('#toast');
    $('#toast-message').textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2200);
  }

  // ===== Confirm Dialog =====
  function showConfirm(message, onOk) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <p>${message.replace(/\n/g, '<br>')}</p>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-cancel">キャンセル</button>
          <button class="confirm-btn confirm-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-cancel').onclick = () => overlay.remove();
    overlay.querySelector('.confirm-ok').onclick = () => { overlay.remove(); onOk(); };
  }

  // ===== Clock =====
  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    $('#current-time').textContent = `${h}:${m}`;
  }

  // ===== Helpers =====
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ===== Event Bindings =====
  function bindEvents() {
    // Back button
    $('#btn-back').addEventListener('click', () => {
      if (currentView === 'subcategory') showView('main');
      else showView('main');
    });

    // Category card click
    $('#category-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.category-card');
      if (!card) return;
      const idx = parseInt(card.dataset.index);
      const cat = CATEGORIES[idx];
      if (cat.items.length === 0) {
        // 直接記録（売店など）
        recordWork(cat.name, null, cat.color);
      } else if (cat.items.length === 1) {
        // 1つしかない場合も直接記録
        recordWork(cat.name, cat.items[0], cat.color);
      } else {
        showSubcategory(idx);
      }
    });

    // Subcategory button click
    $('#subcategory-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.subcategory-btn');
      if (!btn) return;
      const catIdx = parseInt(btn.dataset.cat);
      const itemIdx = parseInt(btn.dataset.item);
      const cat = CATEGORIES[catIdx];
      recordWork(cat.name, cat.items[itemIdx], cat.color);
    });

    // Bottom actions
    $('#btn-timeline').addEventListener('click', () => showTimeline());
    $('#btn-dashboard').addEventListener('click', () => showDashboard());
    $('#btn-end-work').addEventListener('click', () => endWork());

    // Timeline date change
    $('#timeline-date').addEventListener('change', (e) => loadTimeline(e.target.value));

    // Timeline item click => open edit
    $('#timeline-list').addEventListener('click', (e) => {
      const item = e.target.closest('.timeline-item');
      if (!item) return;
      const id = item.dataset.id;
      const timeEl = item.querySelector('.tl-time');
      if (!timeEl) return;
      const parts = timeEl.textContent.split('→').map(s => s.trim());
      openEditModal(id, parts[0], parts[1] || '');
    });

    // Edit modal
    $('#btn-edit-cancel').addEventListener('click', closeEditModal);
    $('#btn-edit-save').addEventListener('click', saveEdit);
    $('#btn-edit-delete').addEventListener('click', deleteRecord);
    $('.modal-backdrop').addEventListener('click', closeEditModal);

    // Summary close
    $('#btn-summary-close').addEventListener('click', () => showView('main'));

    // Dashboard tabs
    $$('.dash-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.dash-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const t = tab.dataset.tab;
        if (t === 'monthly') {
          $('#month-selector').classList.remove('hidden');
        } else {
          $('#month-selector').classList.add('hidden');
        }
        loadDashboard(t);
      });
    });

    // Dashboard month change
    $('#dashboard-month').addEventListener('change', () => loadDashboard('monthly'));
  }

  // ===== Start =====
  document.addEventListener('DOMContentLoaded', init);
})();
