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
      items: ['デリコ出荷対応', '県販出荷対応', '個人出荷対応', '配達'],
      hasNoteInput: true
    },
    {
      name: '在庫作り', icon: '📦', colorClass: 'card-label', color: '#9e9e9e',
      items: ['ラベル貼り', '箱詰め作業', 'その他'],
      hasNoteInput: true
    },
    {
      name: '詰め作業', icon: '🫙', colorClass: 'card-fill', color: '#42a5f5',
      items: ['缶ビール', '瓶ビール', 'ビールPET', '日本酒'],
      hasNoteInput: true
    },
    {
      name: '売店', icon: '🏪', colorClass: 'card-shop', color: '#ab47bc',
      items: ['売店', '事務関係']
    },
    {
      name: 'その他共通', icon: '📋', colorClass: 'card-other', color: '#e0e0e0',
      items: ['会議・打ち合わせ', '休憩', '資料作成', '運搬', 'その他']
    }
  ];

  // ===== State =====
  let currentView = 'main';
  let timerInterval = null;
  let currentWorkStart = null;

  // ===== Coworkers =====
  const COWORKERS = ['部長', '藤森', '宮澤', '工藤', '百瀬', '松倉', '野口', '志賀', '林(麗)', '野明', '高木'];

  // ===== DOM References =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const views = {
    main: $('#view-main'),
    subcategory: $('#view-subcategory'),
    timeline: $('#view-timeline'),
    summary: $('#view-summary'),
    dashboard: $('#view-dashboard'),
    schedule: $('#view-schedule')
  };

  // ===== Init =====
  function init() {
    renderCategoryGrid();
    updateClock();
    setInterval(updateClock, 1000);
    checkCurrentWork();
    loadDeadlineTasks();
    loadTransferDays();
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
    const transferBtn = $('#btn-transfer-days');
    if (name === 'main') {
      backBtn.classList.add('hidden');
      if (transferBtn) transferBtn.classList.remove('hidden');
      $('#header-title').textContent = '📋 業務日報';
    } else {
      backBtn.classList.remove('hidden');
      if (transferBtn) transferBtn.classList.add('hidden');
      $('#header-title').textContent = title || '📋 業務日報';
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
  async function recordWork(category, subcategory, color, note, coWorkers) {
    try {
      const res = await API.createRecord(category, subcategory, color, note, coWorkers);
      if (res.success) {
        showToast(res.message);
        showView('main');
        checkCurrentWork();
      }
    } catch (e) {
      showToast('記録に失敗しました');
    }
  }

  // ===== Note & Coworker Input Dialog =====
  function showNoteDialog(category, subcategory, color) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const coworkerBtns = COWORKERS.map(name => `
      <button type="button" class="coworker-btn" data-name="${name}">${name}</button>
    `).join('');

    overlay.innerHTML = `
      <div class="confirm-box note-dialog modal-content-scroll" style="max-height: 85vh; overflow-y: auto;">
        <p class="note-dialog-title">📝 ${subcategory}</p>
        
        <div class="dialog-field" style="margin-top: 12px; text-align: left;">
          <label class="dialog-label" style="font-weight: 600; font-size: 0.85rem; color: var(--text-secondary); display: block; margin-bottom: 6px;">👥 同行者 (複数選択可)</label>
          <div class="coworker-selector-grid">
            ${coworkerBtns}
          </div>
          <input type="text" class="coworker-custom-input" placeholder="手入力欄（その他同行者など）..." style="width: 100%; margin-top: 8px; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-elevated); color: var(--text-primary); font-size: 0.85rem;">
        </div>

        <p class="note-dialog-subtitle" style="margin-top: 15px; margin-bottom: 5px;">メモを入力しますか？</p>
        <div class="note-toggle-wrap">
          <button class="note-toggle-btn active" data-mode="skip">入力しない</button>
          <button class="note-toggle-btn" data-mode="input">入力する</button>
        </div>
        <div class="note-input-wrap hidden">
          <textarea class="note-textarea" placeholder="メモを入力..." rows="3"></textarea>
        </div>
        <div class="confirm-actions" style="margin-top: 20px;">
          <button class="confirm-btn confirm-cancel">キャンセル</button>
          <button class="confirm-btn confirm-ok note-ok-btn">記録する</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // 同行者選択のトグル
    overlay.querySelectorAll('.coworker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
      });
    });

    const skipBtn = overlay.querySelector('[data-mode="skip"]');
    const inputBtn = overlay.querySelector('[data-mode="input"]');
    const inputWrap = overlay.querySelector('.note-input-wrap');
    const textarea = overlay.querySelector('.note-textarea');

    skipBtn.addEventListener('click', () => {
      skipBtn.classList.add('active');
      inputBtn.classList.remove('active');
      inputWrap.classList.add('hidden');
    });
    inputBtn.addEventListener('click', () => {
      inputBtn.classList.add('active');
      skipBtn.classList.remove('active');
      inputWrap.classList.remove('hidden');
      textarea.focus();
    });

    overlay.querySelector('.confirm-cancel').onclick = () => overlay.remove();
    overlay.querySelector('.note-ok-btn').onclick = () => {
      // 選択された同行者
      const selected = Array.from(overlay.querySelectorAll('.coworker-btn.active')).map(btn => btn.dataset.name);
      // 手入力
      const customVal = overlay.querySelector('.coworker-custom-input').value.trim();
      if (customVal) selected.push(customVal);

      const coWorkers = selected.length > 0 ? selected.join(', ') : null;
      const note = inputBtn.classList.contains('active') ? textarea.value.trim() || null : null;

      overlay.remove();
      recordWork(category, subcategory, color, note, coWorkers);
    };
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
        const noteHtml = r.note ? `<div class="tl-note">📝 ${r.note}</div>` : '';
        const photoHtml = r.photo ? `<div class="tl-photo"><img src="${r.photo}" alt="写真" class="tl-photo-thumb"></div>` : '';
        const coworkersHtml = r.co_workers ? `<div class="tl-coworkers">👥 ${r.co_workers}</div>` : '';
        return `
          <div class="timeline-item" data-id="${r.id}" data-co-workers="${r.co_workers || ''}">
            <div class="tl-color" style="background:${r.color}"></div>
            <div class="tl-info">
              <div class="tl-category">${label}</div>
              <div class="tl-sub">${r.category}</div>
              ${noteHtml}
              ${coworkersHtml}
              ${photoHtml}
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
  let editPhotoData = null; // null=変更なし, ''は削除, data:url=新写真
  let editPhotoChanged = false;

  function openEditModal(recordId, startTime, endTime, note, photo, coWorkers) {
    $('#edit-record-id').value = recordId;
    $('#edit-start-time').value = startTime;
    $('#edit-end-time').value = endTime || '';
    $('#edit-note').value = note || '';

    // 同行者トグルボタンを動的に生成＆初期選択状態を設定
    const selector = $('#edit-coworker-selector');
    const coworkerList = coWorkers ? coWorkers.split(',').map(s => s.trim()) : [];

    const coworkerBtns = COWORKERS.map(name => {
      const idx = coworkerList.indexOf(name);
      const isActive = idx !== -1;
      if (isActive) {
        coworkerList.splice(idx, 1); // 検出したらリストから除外
      }
      const cls = isActive ? 'coworker-btn active' : 'coworker-btn';
      return `<button type="button" class="${cls}" data-name="${name}">${name}</button>`;
    }).join('');

    selector.innerHTML = coworkerBtns;

    // トグルイベントを登録
    selector.querySelectorAll('.coworker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
      });
    });

    // 残った同行者をカスタム手入力欄にセット
    $('#edit-coworker-custom').value = coworkerList.join(', ');

    // 写真プレビュー
    editPhotoData = undefined; // undefined=変更なし
    editPhotoChanged = false;
    $('#edit-photo-input').value = '';
    if (photo) {
      $('#photo-preview-img').src = photo;
      $('#photo-preview-wrap').classList.remove('hidden');
    } else {
      $('#photo-preview-wrap').classList.add('hidden');
      $('#photo-preview-img').src = '';
    }

    $('#edit-modal').classList.remove('hidden');
  }
  function closeEditModal() {
    $('#edit-modal').classList.add('hidden');
    editPhotoData = undefined;
    editPhotoChanged = false;
  }

  async function saveEdit() {
    const id = $('#edit-record-id').value;
    const startTime = $('#edit-start-time').value;
    const endTime = $('#edit-end-time').value || null;
    const note = $('#edit-note').value.trim() || null;
    const photo = editPhotoChanged ? (editPhotoData || null) : undefined;

    // 同行者情報をマージして収集
    const selected = Array.from($('#edit-coworker-selector').querySelectorAll('.coworker-btn.active')).map(btn => btn.dataset.name);
    const customVal = $('#edit-coworker-custom').value.trim();
    if (customVal) {
      customVal.split(',').map(s => s.trim()).forEach(val => {
        if (val && !selected.includes(val)) selected.push(val);
      });
    }
    const coWorkers = selected.length > 0 ? selected.join(', ') : null;

    try {
      const res = await API.updateRecord(id, startTime, endTime, note, photo, coWorkers);
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

  // ===== Photo Compression =====
  function compressImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function handlePhotoSelect(file) {
    if (!file) return;
    compressImage(file, 800, 0.6).then(dataUrl => {
      editPhotoData = dataUrl;
      editPhotoChanged = true;
      $('#photo-preview-img').src = dataUrl;
      $('#photo-preview-wrap').classList.remove('hidden');
    });
  }

  function removePhoto() {
    editPhotoData = '';
    editPhotoChanged = true;
    $('#photo-preview-wrap').classList.add('hidden');
    $('#photo-preview-img').src = '';
    $('#edit-photo-input').value = '';
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

  // ===== Transfer Needed Days =====
  let currentTransferDays = 0.0;

  async function loadTransferDays() {
    try {
      const res = await API.getTransferDays();
      if (res.success) {
        currentTransferDays = res.value;
        renderTransferDays();
      }
    } catch (e) {
      console.error('loadTransferDays error:', e);
    }
  }

  function renderTransferDays() {
    const valEl = $('#transfer-days-value');
    const labelEl = $('#transfer-days-label');
    const btnEl = $('#btn-transfer-days');
    if (!valEl || !labelEl) return;

    if (currentTransferDays < 0) {
      labelEl.textContent = '借金💦';
      if (btnEl) btnEl.classList.add('debt');
    } else {
      labelEl.textContent = '振替必要日数';
      if (btnEl) btnEl.classList.remove('debt');
    }
    valEl.textContent = `${currentTransferDays.toFixed(1)}日`;
  }

  function openTransferModal() {
    $('#transfer-input-value').value = currentTransferDays.toFixed(1);
    $('#transfer-modal').classList.remove('hidden');
    setTimeout(() => $('#transfer-input-value').focus(), 100);
  }
  function closeTransferModal() {
    $('#transfer-modal').classList.add('hidden');
  }
  async function saveTransferDays() {
    const val = parseFloat($('#transfer-input-value').value);
    if (isNaN(val)) {
      showToast('正しい数値を入力してください');
      return;
    }
    try {
      const res = await API.saveTransferDays(val);
      if (res.success) {
        currentTransferDays = res.value;
        renderTransferDays();
        closeTransferModal();
        showToast('振替必要日数を更新しました');
      }
    } catch (e) {
      showToast('更新に失敗しました');
    }
  }

  // ===== End Work =====

  // ===== Schedule =====
  const DAYS = ['mon','tue','wed','thu','fri','sat'];
  const DAY_LABELS = ['月','火','水','木','金','土'];
  const BEER_COLORS = [
    { name: 'しらかば', color: '#f5c542' },
    { name: 'アルクマ', color: '#ef5350' },
    { name: 'りんどう', color: '#66bb6a' },
    { name: 'くろゆり', color: '#ec407a' },
    { name: 'ウィート', color: '#9e9e9e' },
    { name: '七味唐からし', color: '#ff9800' },
    { name: 'IPA', color: '#ab47bc' },
    { name: 'ゴールデンエール', color: '#fdd835' },
    { name: 'ハイボール', color: '#78909c' },
    { name: 'にごり酒', color: '#8d6e63' },
    { name: 'その他', color: '#42a5f5' }
  ];

  let currentWeekStart = getMonday(new Date());
  let weeklyData = {};
  let schedPhotoData = undefined;
  let schedPhotoChanged = false;

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return formatDateLocal(date);
  }
  function formatDateLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d;
  }

  async function showSchedule() {
    showView('schedule', '📅 スケジュール');
    await loadWeeklySchedule();
  }

  async function loadWeeklySchedule() {
    updateWeekLabel();
    try {
      const res = await API.getSchedule(currentWeekStart);
      if (res.success && res.schedule) {
        weeklyData = res.schedule.schedule_data || {};
        if (res.schedule.photo) {
          $('#sched-photo-img').src = res.schedule.photo;
          $('#sched-photo-preview').classList.remove('hidden');
        } else {
          $('#sched-photo-preview').classList.add('hidden');
        }
      } else {
        weeklyData = {};
        $('#sched-photo-preview').classList.add('hidden');
      }
      schedPhotoData = undefined;
      schedPhotoChanged = false;
      $('#sched-photo-input').value = '';
      renderWeeklyGrid();
    } catch (e) {
      showToast('スケジュールの読み込みに失敗');
    }
  }

  function updateWeekLabel() {
    const mon = addDays(currentWeekStart, 0);
    const sat = addDays(currentWeekStart, 5);
    const ml = `${mon.getMonth()+1}/${mon.getDate()}`;
    const sl = `${sat.getMonth()+1}/${sat.getDate()}`;
    $('#week-label').textContent = `${ml} 〜 ${sl}`;
  }

  function renderWeeklyGrid() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const headers = DAYS.map((day, i) => {
      const d = addDays(currentWeekStart, i);
      const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      const cls = isToday ? ' class="today-col"' : '';
      return `<th${cls}>${d.getDate()}${DAY_LABELS[i]}</th>`;
    }).join('');

    // 1. 製造日程 (AM/PM)
    const periods = ['AM','PM'];
    const rows = periods.map(p => {
      const cells = DAYS.map((day, i) => {
        const d = addDays(currentWeekStart, i);
        const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
        const val = (weeklyData[day] && weeklyData[day][p.toLowerCase()]) || '';
        let cls = val ? 'grid-cell has-content' : 'grid-cell';
        if (isToday) cls += ' today-col';
        return `<td class="${cls}" data-day="${day}" data-period="${p.toLowerCase()}">${val}</td>`;
      }).join('');
      return `<tr><td class="period-label">${p}</td>${cells}</tr>`;
    }).join('');

    $('#weekly-grid').innerHTML = `
      <table class="weekly-table">
        <thead><tr><th></th>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // 2. 仕込予定
    const brewCells = DAYS.map((day, i) => {
      const d = addDays(currentWeekStart, i);
      const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      const val = (weeklyData[day] && weeklyData[day]['brew']) || '';
      let cls = val ? 'grid-cell has-content' : 'grid-cell';
      if (isToday) cls += ' today-col';
      return `<td class="${cls}" data-day="${day}" data-period="brew">${val}</td>`;
    }).join('');

    $('#brew-grid').innerHTML = `
      <table class="weekly-table">
        <thead><tr><th></th>${headers}</tr></thead>
        <tbody>
          <tr><td class="period-label" style="font-size:0.7rem; width:36px;">仕込</td>${brewCells}</tr>
        </tbody>
      </table>
    `;

    // 3. 濾過火入れ
    const filtCells = DAYS.map((day, i) => {
      const d = addDays(currentWeekStart, i);
      const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      const val = (weeklyData[day] && weeklyData[day]['filtration']) || '';
      let cls = val ? 'grid-cell has-content' : 'grid-cell';
      if (isToday) cls += ' today-col';
      return `<td class="${cls}" data-day="${day}" data-period="filtration">${val}</td>`;
    }).join('');

    $('#filtration-grid').innerHTML = `
      <table class="weekly-table">
        <thead><tr><th></th>${headers}</tr></thead>
        <tbody>
          <tr><td class="period-label" style="font-size:0.7rem; width:36px;">濾過</td>${filtCells}</tr>
        </tbody>
      </table>
    `;
  }

  function openCellEdit(day, period) {
    const dayIdx = DAYS.indexOf(day);
    const d = addDays(currentWeekStart, dayIdx);
    
    let periodLabel = period.toUpperCase();
    if (period === 'brew') periodLabel = '仕込予定';
    if (period === 'filtration') periodLabel = '濾過火入れ';

    const label = `${d.getMonth()+1}/${d.getDate()}(${DAY_LABELS[dayIdx]}) ${periodLabel}`;
    $('#cell-edit-day').value = day;
    $('#cell-edit-period').value = period;
    $('#cell-edit-label').textContent = label;
    $('#cell-edit-text').value = (weeklyData[day] && weeklyData[day][period]) || '';
    $('#cell-edit-modal').classList.remove('hidden');
    setTimeout(() => $('#cell-edit-text').focus(), 100);
  }
  function closeCellEdit() {
    $('#cell-edit-modal').classList.add('hidden');
  }
  function saveCellEdit() {
    const day = $('#cell-edit-day').value;
    const period = $('#cell-edit-period').value;
    const text = $('#cell-edit-text').value.trim();
    if (!weeklyData[day]) weeklyData[day] = {};
    weeklyData[day][period] = text;
    renderWeeklyGrid();
    closeCellEdit();
  }

  async function saveWeeklySchedule() {
    try {
      const photo = schedPhotoChanged ? (schedPhotoData || null) : undefined;
      const res = await API.saveSchedule(currentWeekStart, weeklyData, photo);
      if (res.success) {
        showToast('スケジュールを保存しました');
        schedPhotoChanged = false;
      } else {
        showToast(res.error || '保存に失敗しました');
      }
    } catch (e) {
      console.error('saveWeeklySchedule error:', e);
      showToast('保存失敗: ' + (e.message || '不明なエラー'));
    }
  }



  // ===== Deadline Tasks =====
  let deadlineTasks = [];

  async function loadDeadlineTasks() {
    try {
      const res = await API.getTasks();
      if (res.success) deadlineTasks = res.items || [];
      renderDeadlineTasks();
    } catch (e) {
      console.error('loadDeadlineTasks error:', e);
    }
  }

  function renderDeadlineTasks() {
    const section = $('#deadline-section');
    const list = $('#deadline-list');
    if (deadlineTasks.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    list.innerHTML = deadlineTasks.map(task => {
      // 前日基準のカウントダウン
      const deadline = new Date(task.deadline_date + 'T00:00:00');
      const targetDate = new Date(deadline);
      targetDate.setDate(targetDate.getDate() - 1); // 前日
      const diffMs = targetDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let countdownText, colorClass, urgent = '';
      if (diffDays > 3) {
        countdownText = `${diffDays}`;
        colorClass = 'green';
      } else if (diffDays > 0) {
        countdownText = `${diffDays}`;
        colorClass = 'yellow';
      } else if (diffDays === 0) {
        countdownText = '前日';
        colorClass = 'red';
        urgent = ' pulse-urgent';
      } else {
        countdownText = `${Math.abs(diffDays)}`;
        colorClass = 'red';
        urgent = ' pulse-urgent';
      }

      const unitText = diffDays > 0 ? '日前' : (diffDays === 0 ? '' : '日超過');

      const dlMonth = deadline.getMonth() + 1;
      const dlDay = deadline.getDate();
      const dayNames = ['日','月','火','水','木','金','土'];
      const dlDow = dayNames[deadline.getDay()];

      return `
        <div class="dl-card" data-task-id="${task.id}">
          <div class="dl-countdown ${colorClass}${urgent}">
            ${countdownText}<span class="dl-unit">${unitText}</span>
          </div>
          <div class="dl-info">
            <div class="dl-task-title">${task.title}</div>
            <div class="dl-date">期日: ${dlMonth}/${dlDay}(${dlDow})</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function openTaskModal(taskId) {
    if (taskId) {
      const task = deadlineTasks.find(t => String(t.id) === String(taskId));
      if (!task) return;
      $('#task-modal-title').textContent = '✒️ タスクを編集';
      $('#task-edit-id').value = task.id;
      $('#task-input-title').value = task.title;
      $('#task-input-date').value = task.deadline_date;
      $('#task-modal-extra').classList.remove('hidden');
    } else {
      $('#task-modal-title').textContent = '⏳ タスクを追加';
      $('#task-edit-id').value = '';
      $('#task-input-title').value = '';
      $('#task-input-date').value = '';
      $('#task-modal-extra').classList.add('hidden');
    }
    $('#task-modal').classList.remove('hidden');
    setTimeout(() => $('#task-input-title').focus(), 100);
  }

  function closeTaskModal() {
    $('#task-modal').classList.add('hidden');
  }

  async function saveTask() {
    const title = $('#task-input-title').value.trim();
    const date = $('#task-input-date').value;
    if (!title || !date) {
      showToast('タスク内容と期日を入力してください');
      return;
    }
    try {
      const editId = $('#task-edit-id').value;
      if (editId) {
        await API.updateTask(editId, title, date);
        showToast('タスクを更新しました');
      } else {
        await API.createTask(title, date);
        showToast('タスクを追加しました');
      }
      closeTaskModal();
      await loadDeadlineTasks();
    } catch (e) {
      showToast('保存失敗: ' + (e.message || ''));
    }
  }

  async function completeTask() {
    const id = $('#task-edit-id').value;
    if (!id) return;
    try {
      await API.completeTask(id);
      showToast('タスクを完了しました 🎉');
      closeTaskModal();
      await loadDeadlineTasks();
    } catch (e) {
      showToast('エラー: ' + (e.message || ''));
    }
  }

  async function deleteTask() {
    const id = $('#task-edit-id').value;
    if (!id) return;
    showConfirm('このタスクを削除しますか？', async () => {
      try {
        await API.deleteTask(id);
        showToast('タスクを削除しました');
        closeTaskModal();
        await loadDeadlineTasks();
      } catch (e) {
        showToast('エラー: ' + (e.message || ''));
      }
    });
  }

  // ===== Color Picker =====
  function showColorPicker(dotEl, items, idx) {
    const existing = document.querySelector('.color-picker-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'color-picker-overlay';
    document.body.appendChild(overlay);

    const popup = document.createElement('div');
    popup.className = 'color-picker-popup';
    const rect = dotEl.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 230))}px`;
    popup.innerHTML = BEER_COLORS.map(c =>
      `<div class="cp-swatch${items[idx].color === c.color ? ' active' : ''}" style="background:${c.color}" data-color="${c.color}" title="${c.name}"></div>`
    ).join('');
    document.body.appendChild(popup);

    const close = () => { overlay.remove(); popup.remove(); };
    overlay.addEventListener('click', close);
    popup.addEventListener('click', (e) => {
      const sw = e.target.closest('.cp-swatch');
      if (!sw) return;
      items[idx].color = sw.dataset.color;
      dotEl.style.background = sw.dataset.color;
      close();
    });
  }
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
    // Transfer Needed Days
    $('#btn-transfer-days').addEventListener('click', openTransferModal);
    $('#btn-transfer-cancel').addEventListener('click', closeTransferModal);
    $('#btn-transfer-save').addEventListener('click', saveTransferDays);
    $('.transfer-modal-backdrop').addEventListener('click', closeTransferModal);

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
        showNoteDialog(cat.name, cat.name, cat.color);
      } else if (cat.items.length === 1) {
        showNoteDialog(cat.name, cat.items[0], cat.color);
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
      showNoteDialog(cat.name, cat.items[itemIdx], cat.color);
    });

    // Bottom actions
    $('#btn-timeline').addEventListener('click', () => showTimeline());
    $('#btn-schedule').addEventListener('click', () => showSchedule());
    $('#btn-add-task-bottom').addEventListener('click', () => openTaskModal(null));
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
      const noteEl = item.querySelector('.tl-note');
      const note = noteEl ? noteEl.textContent.replace(/^📝\s*/, '') : '';
      const photoEl = item.querySelector('.tl-photo-thumb');
      const photo = photoEl ? photoEl.src : '';
      const coWorkers = item.dataset.coWorkers || '';
      openEditModal(id, parts[0], parts[1] || '', note, photo, coWorkers);
    });

    // Edit modal
    $('#btn-edit-cancel').addEventListener('click', closeEditModal);
    $('#btn-edit-save').addEventListener('click', saveEdit);
    $('#btn-edit-delete').addEventListener('click', deleteRecord);
    $('.modal-backdrop').addEventListener('click', closeEditModal);

    // Photo events
    $('#edit-photo-input').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) handlePhotoSelect(e.target.files[0]);
    });
    $('#btn-photo-remove').addEventListener('click', removePhoto);

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

    // ===== Task Events =====
    $('#btn-add-task').addEventListener('click', () => openTaskModal(null));
    $('#btn-task-cancel').addEventListener('click', closeTaskModal);
    $('.task-modal-backdrop').addEventListener('click', closeTaskModal);
    $('#btn-task-save').addEventListener('click', saveTask);
    $('#btn-task-complete').addEventListener('click', completeTask);
    $('#btn-task-delete').addEventListener('click', deleteTask);
    $('#deadline-list').addEventListener('click', (e) => {
      const card = e.target.closest('.dl-card');
      if (card) openTaskModal(card.dataset.taskId);
    });

    // ===== Schedule Events =====
    // Week navigation
    $('#btn-week-prev').addEventListener('click', () => {
      currentWeekStart = formatDateLocal(addDays(currentWeekStart, -7));
      loadWeeklySchedule();
    });
    $('#btn-week-next').addEventListener('click', () => {
      currentWeekStart = formatDateLocal(addDays(currentWeekStart, 7));
      loadWeeklySchedule();
    });

    // Grid cell click
    const handleGridClick = (e) => {
      const cell = e.target.closest('.grid-cell');
      if (cell) openCellEdit(cell.dataset.day, cell.dataset.period);
    };
    $('#weekly-grid').addEventListener('click', handleGridClick);
    $('#brew-grid').addEventListener('click', handleGridClick);
    $('#filtration-grid').addEventListener('click', handleGridClick);

    // Cell edit modal
    $('#btn-cell-cancel').addEventListener('click', closeCellEdit);
    $('#btn-cell-save').addEventListener('click', saveCellEdit);
    $('.cell-modal-backdrop').addEventListener('click', closeCellEdit);

    // Save weekly
    $('#btn-save-weekly').addEventListener('click', saveWeeklySchedule);

    // Schedule photo
    $('#sched-photo-input').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        compressImage(e.target.files[0], 1200, 0.7).then(dataUrl => {
          schedPhotoData = dataUrl;
          schedPhotoChanged = true;
          $('#sched-photo-img').src = dataUrl;
          $('#sched-photo-preview').classList.remove('hidden');
        });
      }
    });
    $('#btn-sched-photo-remove').addEventListener('click', () => {
      schedPhotoData = '';
      schedPhotoChanged = true;
      $('#sched-photo-preview').classList.add('hidden');
      $('#sched-photo-input').value = '';
    });
  }

  // ===== Start =====
  document.addEventListener('DOMContentLoaded', init);
})();
