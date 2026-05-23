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
      items: ['会議・打ち合わせ', '休憩', '資料作成']
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
  async function recordWork(category, subcategory, color, note) {
    try {
      const res = await API.createRecord(category, subcategory, color, note);
      if (res.success) {
        showToast(res.message);
        showView('main');
        checkCurrentWork();
      }
    } catch (e) {
      showToast('記録に失敗しました');
    }
  }

  // ===== Note Input Dialog =====
  function showNoteDialog(category, subcategory, color) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box note-dialog">
        <p class="note-dialog-title">📝 ${subcategory}</p>
        <p class="note-dialog-subtitle">メモを入力しますか？</p>
        <div class="note-toggle-wrap">
          <button class="note-toggle-btn active" data-mode="skip">入力しない</button>
          <button class="note-toggle-btn" data-mode="input">入力する</button>
        </div>
        <div class="note-input-wrap hidden">
          <textarea class="note-textarea" placeholder="メモを入力..." rows="3"></textarea>
        </div>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-cancel">キャンセル</button>
          <button class="confirm-btn confirm-ok note-ok-btn">記録する</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

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
      const note = inputBtn.classList.contains('active') ? textarea.value.trim() || null : null;
      overlay.remove();
      recordWork(category, subcategory, color, note);
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
        return `
          <div class="timeline-item" data-id="${r.id}">
            <div class="tl-color" style="background:${r.color}"></div>
            <div class="tl-info">
              <div class="tl-category">${label}</div>
              <div class="tl-sub">${r.category}</div>
              ${noteHtml}
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

  function openEditModal(recordId, startTime, endTime, note, photo) {
    $('#edit-record-id').value = recordId;
    $('#edit-start-time').value = startTime;
    $('#edit-end-time').value = endTime || '';
    $('#edit-note').value = note || '';

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
    try {
      const res = await API.updateRecord(id, startTime, endTime, note, photo);
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
    const headers = DAYS.map((day, i) => {
      const d = addDays(currentWeekStart, i);
      return `<th>${d.getDate()}${DAY_LABELS[i]}</th>`;
    }).join('');

    const periods = ['AM','PM'];
    const rows = periods.map(p => {
      const cells = DAYS.map(day => {
        const val = (weeklyData[day] && weeklyData[day][p.toLowerCase()]) || '';
        const cls = val ? 'grid-cell has-content' : 'grid-cell';
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
  }

  function openCellEdit(day, period) {
    const dayIdx = DAYS.indexOf(day);
    const d = addDays(currentWeekStart, dayIdx);
    const label = `${d.getMonth()+1}/${d.getDate()}(${DAY_LABELS[dayIdx]}) ${period.toUpperCase()}`;
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

  // ===== Brew Schedule =====
  let brewItems = [];

  async function loadBrewSchedules() {
    try {
      const res = await API.getBrewSchedules();
      if (res.success) brewItems = res.items || [];
      renderBrewList();
    } catch (e) {
      showToast('仕込予定の読み込みに失敗');
    }
  }

  function renderBrewList() {
    $('#brew-list').innerHTML = brewItems.map((it, i) => `
      <div class="el-row" data-idx="${i}">
        <div class="el-num">${i + 1}</div>
        <div class="el-fields">
          <div class="el-field-row">
            <div class="el-color-dot brew-color-dot" data-idx="${i}" style="background:${it.color || '#f5c542'}"></div>
            <input class="el-input" data-field="beer_type" placeholder="液種" value="${it.beer_type || ''}">
            <input class="el-input short" data-field="brew_number" placeholder="仕込 No." value="${it.brew_number || ''}">
          </div>
          <div class="el-field-row">
            <input class="el-input medium" type="date" data-field="brew_date" value="${it.brew_date || ''}">
          </div>
        </div>
        <button class="el-delete-btn" data-idx="${i}">✕</button>
      </div>
    `).join('') || '<div class="timeline-empty">仕込予定がありません</div>';
  }

  function addBrewRow() {
    brewItems.push({ brew_date: '', beer_type: '', brew_number: '', color: '#f5c542' });
    renderBrewList();
  }

  function collectBrewData() {
    const rows = $$('#brew-list .el-row');
    rows.forEach((row, i) => {
      row.querySelectorAll('.el-input').forEach(inp => {
        brewItems[i][inp.dataset.field] = inp.value;
      });
    });
  }

  async function saveBrewSchedules() {
    try {
      collectBrewData();
      const res = await API.saveBrewSchedules(brewItems);
      if (res.success) {
        showToast('仕込予定を保存しました');
      } else {
        showToast(res.error || '保存に失敗しました');
      }
    } catch (e) {
      console.error('saveBrewSchedules error:', e);
      showToast('保存失敗: ' + (e.message || '不明なエラー'));
    }
  }

  // ===== Filtration Schedule =====
  let filtrationItems = [];

  async function loadFiltrationSchedules() {
    try {
      const res = await API.getFiltrationSchedules();
      if (res.success) filtrationItems = res.items || [];
      renderFiltrationList();
    } catch (e) {
      showToast('濾過予定の読み込みに失敗');
    }
  }

  function renderFiltrationList() {
    $('#filtration-list').innerHTML = filtrationItems.map((it, i) => `
      <div class="el-row" data-idx="${i}">
        <div class="el-num">${i + 1}</div>
        <div class="el-fields">
          <div class="el-field-row">
            <div class="el-color-dot filt-color-dot" data-idx="${i}" style="background:${it.color || '#f5c542'}"></div>
            <input class="el-input" data-field="beer_type" placeholder="液種" value="${it.beer_type || ''}">
            <input class="el-input short" data-field="brew_number" placeholder="仕込 No." value="${it.brew_number || ''}">
          </div>
          <div class="el-field-row">
            <input class="el-input medium" type="date" data-field="filtration_date" value="${it.filtration_date || ''}">
            <input class="el-input" data-field="note" placeholder="備考" value="${it.note || ''}">
          </div>
        </div>
        <button class="el-delete-btn" data-idx="${i}">✕</button>
      </div>
    `).join('') || '<div class="timeline-empty">濾過予定がありません</div>';
  }

  function addFiltrationRow() {
    filtrationItems.push({ beer_type: '', brew_number: '', filtration_date: '', note: '', color: '#f5c542' });
    renderFiltrationList();
  }

  function collectFiltrationData() {
    const rows = $$('#filtration-list .el-row');
    rows.forEach((row, i) => {
      row.querySelectorAll('.el-input').forEach(inp => {
        filtrationItems[i][inp.dataset.field] = inp.value;
      });
    });
  }

  async function saveFiltrationSchedules() {
    try {
      collectFiltrationData();
      const res = await API.saveFiltrationSchedules(filtrationItems);
      if (res.success) {
        showToast('濾過予定を保存しました');
      } else {
        showToast(res.error || '保存に失敗しました');
      }
    } catch (e) {
      console.error('saveFiltrationSchedules error:', e);
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
      if (cat.hasNoteInput) {
        showNoteDialog(cat.name, cat.items[itemIdx], cat.color);
      } else {
        recordWork(cat.name, cat.items[itemIdx], cat.color);
      }
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
      openEditModal(id, parts[0], parts[1] || '', note, photo);
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
    // Tab switching
    $$('.sched-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.sched-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        $$('.sched-panel').forEach(p => p.classList.remove('active'));
        const panel = tab.dataset.stab;
        $(`#sched-${panel}`).classList.add('active');
        if (panel === 'brew') loadBrewSchedules();
        if (panel === 'filtration') loadFiltrationSchedules();
      });
    });

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
    $('#weekly-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.grid-cell');
      if (cell) openCellEdit(cell.dataset.day, cell.dataset.period);
    });

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

    // Brew list events
    $('#btn-brew-add').addEventListener('click', addBrewRow);
    $('#btn-save-brew').addEventListener('click', saveBrewSchedules);
    $('#brew-list').addEventListener('click', (e) => {
      const delBtn = e.target.closest('.el-delete-btn');
      if (delBtn) {
        collectBrewData();
        brewItems.splice(parseInt(delBtn.dataset.idx), 1);
        renderBrewList();
        return;
      }
      const colorDot = e.target.closest('.brew-color-dot');
      if (colorDot) {
        collectBrewData();
        showColorPicker(colorDot, brewItems, parseInt(colorDot.dataset.idx));
      }
    });

    // Filtration list events
    $('#btn-filtration-add').addEventListener('click', addFiltrationRow);
    $('#btn-save-filtration').addEventListener('click', saveFiltrationSchedules);
    $('#filtration-list').addEventListener('click', (e) => {
      const delBtn = e.target.closest('.el-delete-btn');
      if (delBtn) {
        collectFiltrationData();
        filtrationItems.splice(parseInt(delBtn.dataset.idx), 1);
        renderFiltrationList();
        return;
      }
      const colorDot = e.target.closest('.filt-color-dot');
      if (colorDot) {
        collectFiltrationData();
        showColorPicker(colorDot, filtrationItems, parseInt(colorDot.dataset.idx));
      }
    });
  }

  // ===== Start =====
  document.addEventListener('DOMContentLoaded', init);
})();
