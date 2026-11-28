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
      name: '日本酒仕込み', icon: '🍶', colorClass: 'card-sake', color: '#4db6ac',
      items: ['洗米', '蒸し米', '引き込み', '盛り', '出麹', '仕込み', '掛け米']
    },
    {
      name: '出荷対応', icon: '🚚', colorClass: 'card-ship', color: '#8bc34a',
      items: [
        '朝一出荷対応',
        {
          name: '県販・個人出荷対応',
          subItems: ['長野', '松本', '上田', '飯田', '諏訪', '佐久', '伊那']
        },
        '配達'
      ],
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
      name: 'その他共通', icon: '📋', colorClass: 'card-other', color: '#e0e0e0',
      items: ['会議・打ち合わせ', '休憩', '売店', '事務関係', '資料作成', '運搬', 'その他']
    }
  ];

  // ===== State =====
  const CATEGORY_ORDER_KEY = 'brewery_category_order_v1';
  let currentView = 'main';
  let timerInterval = null;
  let currentWorkStart = null;
  let currentCatIndex = null;
  let currentSubParent = null;
  let selectedSubItems = [];
  let isReorderMode = false;
  let dragSrcIndex = null;
  let isDraggingCard = false;
  let suppressNextClick = false;

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
    schedule: $('#view-schedule'),
    calendar: $('#view-calendar'),
    releases: $('#view-releases')
  };

  // ===== Category Order Persistence =====
  function loadCategoryOrder() {
    try {
      const saved = localStorage.getItem(CATEGORY_ORDER_KEY);
      if (!saved) return;
      const orderNames = JSON.parse(saved);
      if (!Array.isArray(orderNames)) return;
      const byName = new Map(CATEGORIES.map(c => [c.name, c]));
      const reordered = [];
      orderNames.forEach(name => {
        if (byName.has(name)) {
          reordered.push(byName.get(name));
          byName.delete(name);
        }
      });
      byName.forEach(c => reordered.push(c));
      CATEGORIES.splice(0, CATEGORIES.length, ...reordered);
    } catch (e) { /* ignore */ }
  }

  function saveCategoryOrder() {
    try {
      localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(CATEGORIES.map(c => c.name)));
    } catch (e) { /* ignore */ }
  }

  function enterReorderMode(activeIndex) {
    isReorderMode = true;
    const grid = $('#category-grid');
    const bar = $('#reorder-bar');
    if (grid) grid.classList.add('reorder-mode');
    if (bar) bar.classList.remove('hidden');
    if (activeIndex !== undefined && activeIndex !== null) {
      const card = grid && grid.querySelector(`.category-card[data-index="${activeIndex}"]`);
      if (card) card.classList.add('is-dragging');
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(30); } catch (e) { /* ignore */ }
    }
  }

  function exitReorderMode() {
    if (!isReorderMode) return;
    isReorderMode = false;
    isDraggingCard = false;
    dragSrcIndex = null;
    const grid = $('#category-grid');
    const bar = $('#reorder-bar');
    if (grid) {
      grid.classList.remove('reorder-mode');
      grid.querySelectorAll('.category-card.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    }
    if (bar) bar.classList.add('hidden');
    saveCategoryOrder();
  }

  function moveCategoryItem(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= CATEGORIES.length || toIdx >= CATEGORIES.length) return;
    const [moved] = CATEGORIES.splice(fromIdx, 1);
    CATEGORIES.splice(toIdx, 0, moved);
    renderCategoryGrid();
    const grid = $('#category-grid');
    if (grid) {
      const newCard = grid.querySelector(`.category-card[data-index="${toIdx}"]`);
      if (newCard) newCard.classList.add('is-dragging');
    }
  }

  // ===== Init =====
  function init() {
    loadCategoryOrder();
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
    if (name !== 'main') exitReorderMode();
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
    currentCatIndex = catIndex;
    currentSubParent = null;
    selectedSubItems = [];
    $('#subcategory-title').textContent = `${cat.icon} ${cat.name}`;
    $('#subcategory-title').style.color = cat.color;
    const multiActions = $('#subcategory-multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    const grid = $('#subcategory-grid');
    grid.classList.remove('area-grid');
    grid.innerHTML = cat.items.map((item, i) => {
      const label = typeof item === 'string' ? item : item.name;
      const hasSub = typeof item === 'object' && Array.isArray(item.subItems) && item.subItems.length > 0;
      const arrowHtml = hasSub ? '<span class="sub-arrow">›</span>' : '';
      return `
        <button class="subcategory-btn" data-cat="${catIndex}" data-item="${i}" id="sub-${catIndex}-${i}">
          <span class="sub-dot" style="background:${cat.color}"></span>
          <span class="sub-label">${label}</span>
          ${arrowHtml}
        </button>
      `;
    }).join('');
    showView('subcategory', cat.name);
  }

  function updateSubConfirmBtn() {
    const btn = $('#btn-subcategory-confirm');
    if (!btn) return;
    if (selectedSubItems.length > 0) {
      btn.textContent = `✅ 決定（${selectedSubItems.join('・')}）`;
    } else {
      btn.textContent = 'このまま次へ（地域指定なし）';
    }
  }

  function showSubSubcategory(catIndex, itemIndex) {
    const cat = CATEGORIES[catIndex];
    const item = cat.items[itemIndex];
    currentCatIndex = catIndex;
    currentSubParent = { index: itemIndex, name: item.name, subItems: item.subItems };
    selectedSubItems = [];
    $('#subcategory-title').textContent = `${cat.icon} ${item.name}（複数選択可）`;
    $('#subcategory-title').style.color = cat.color;
    const grid = $('#subcategory-grid');
    grid.classList.add('area-grid');
    grid.innerHTML = item.subItems.map((subName, subIdx) => `
      <button class="subcategory-btn area-btn" data-cat="${catIndex}" data-item="${itemIndex}" data-subitem="${subIdx}" id="sub-${catIndex}-${itemIndex}-${subIdx}">
        <span class="sub-dot" style="background:${cat.color}"></span>
        <span class="sub-label">${subName}</span>
      </button>
    `).join('');
    const multiActions = $('#subcategory-multi-actions');
    if (multiActions) multiActions.classList.remove('hidden');
    updateSubConfirmBtn();
    showView('subcategory', item.name);
  }

  // ===== Record Work =====
  async function recordWork(category, subcategory, color, note, coWorkers, startTime) {
    try {
      const res = await API.createRecord(category, subcategory, color, note, coWorkers, startTime);
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

    const defaultStartTime = nowTimeStr();

    overlay.innerHTML = `
      <div class="confirm-box note-dialog modal-content-scroll" style="max-height: 85vh; overflow-y: auto;">
        <p class="note-dialog-title">📝 ${subcategory}</p>

        <div class="dialog-field" style="margin-top: 12px; text-align: left;">
          <label class="dialog-label" style="font-weight: 600; font-size: 0.85rem; color: var(--text-secondary); display: block; margin-bottom: 6px;">⏰ 開始時間</label>
          <input type="time" class="start-time-input time-input" value="${defaultStartTime}" style="padding: 10px 12px; font-size: 1rem;">
        </div>
        
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
      const startTimeVal = overlay.querySelector('.start-time-input').value || nowTimeStr();
      // 選択された同行者
      const selected = Array.from(overlay.querySelectorAll('.coworker-btn.active')).map(btn => btn.dataset.name);
      // 手入力
      const customVal = overlay.querySelector('.coworker-custom-input').value.trim();
      if (customVal) selected.push(customVal);

      const coWorkers = selected.length > 0 ? selected.join(', ') : null;
      const note = inputBtn.classList.contains('active') ? textarea.value.trim() || null : null;

      overlay.remove();
      recordWork(category, subcategory, color, note, coWorkers, startTimeVal);
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
  let schedZoomScale = 1;
  let schedZoomTx = 0;
  let schedZoomTy = 0;

  function updateSchedPhotoTransform() {
    const img = $('#sched-photo-img');
    const wrap = $('#sched-photo-preview');
    const resetBtn = $('#btn-sched-photo-zoom-reset');
    if (!img || !wrap) return;
    if (schedZoomScale <= 1.01) {
      schedZoomScale = 1;
      schedZoomTx = 0;
      schedZoomTy = 0;
      img.style.transform = '';
      wrap.classList.remove('is-zoomed');
      if (resetBtn) resetBtn.classList.add('hidden');
    } else {
      img.style.transform = `translate(${schedZoomTx}px, ${schedZoomTy}px) scale(${schedZoomScale})`;
      wrap.classList.add('is-zoomed');
      if (resetBtn) resetBtn.classList.remove('hidden');
    }
  }

  function resetSchedPhotoZoom() {
    schedZoomScale = 1;
    schedZoomTx = 0;
    schedZoomTy = 0;
    updateSchedPhotoTransform();
  }

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
          $('#btn-copy-photo-next-week').classList.remove('hidden');
        } else {
          $('#sched-photo-img').src = '';
          $('#sched-photo-preview').classList.add('hidden');
          $('#btn-copy-photo-next-week').classList.add('hidden');
        }
      } else {
        weeklyData = {};
        $('#sched-photo-img').src = '';
        $('#sched-photo-preview').classList.add('hidden');
        $('#btn-copy-photo-next-week').classList.add('hidden');
      }
      schedPhotoData = undefined;
      schedPhotoChanged = false;
      resetSchedPhotoZoom();
      $('#sched-photo-input').value = '';
      if ($('#sched-photo-camera-input')) $('#sched-photo-camera-input').value = '';
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

    // その他スケジュール (AM/PM)
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
  }

  function openCellEdit(day, period) {
    const dayIdx = DAYS.indexOf(day);
    const d = addDays(currentWeekStart, dayIdx);
    const periodLabel = period.toUpperCase();
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

  async function copyPhotoToNextWeek() {
    const currentPhoto = schedPhotoChanged ? schedPhotoData : $('#sched-photo-img').getAttribute('src');
    if (!currentPhoto) {
      showToast('コピーする写真がありません');
      return;
    }
    try {
      // 現在の週の未保存変更があれば先に保存しておく
      if (schedPhotoChanged) {
        await API.saveSchedule(currentWeekStart, weeklyData, schedPhotoData || null);
        schedPhotoChanged = false;
      }
      const nextWeekStart = formatDateLocal(addDays(currentWeekStart, 7));
      const nextRes = await API.getSchedule(nextWeekStart);
      const nextData = (nextRes.success && nextRes.schedule && nextRes.schedule.schedule_data) ? nextRes.schedule.schedule_data : {};
      const saveRes = await API.saveSchedule(nextWeekStart, nextData, currentPhoto);
      if (saveRes.success) {
        const mon = addDays(nextWeekStart, 0);
        const sat = addDays(nextWeekStart, 5);
        showToast(`翌週(${mon.getMonth()+1}/${mon.getDate()}〜${sat.getMonth()+1}/${sat.getDate()})に写真をコピーしました📋`);
      } else {
        showToast('コピーに失敗しました');
      }
    } catch (e) {
      showToast('コピー失敗: ' + (e.message || ''));
    }
  }

  // ===== Monthly / Yearly Calendar (Linked with Weekly Schedule) =====
  const ALL_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const ALL_DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
  let currentCalYear = new Date().getFullYear();
  let currentCalMonth = new Date().getMonth(); // 0-11
  let calendarSchedules = {}; // { [week_start]: schedule_data }

  async function openMonthlyCalendar() {
    // 現在の週間スケジュールの入力内容を先に保存して連動を確実にする
    try {
      const photo = schedPhotoChanged ? (schedPhotoData || null) : undefined;
      await API.saveSchedule(currentWeekStart, weeklyData, photo);
      schedPhotoChanged = false;
    } catch (e) {
      // ignore
    }
    const baseDate = new Date(currentWeekStart + 'T00:00:00');
    currentCalYear = baseDate.getFullYear();
    currentCalMonth = baseDate.getMonth();
    showView('calendar', '📆 年間カレンダー');
    await loadMonthlyCalendar();
  }

  function getWeeksForMonth(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // カレンダー表示範囲の最初の日曜日〜最後の土曜日
    const startCal = new Date(firstDay);
    startCal.setDate(startCal.getDate() - startCal.getDay());
    const endCal = new Date(lastDay);
    endCal.setDate(endCal.getDate() + (6 - endCal.getDay()));

    const weeksSet = new Set();
    const cur = new Date(startCal);
    while (cur <= endCal) {
      weeksSet.add(getMonday(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return {
      startCal,
      endCal,
      weeks: Array.from(weeksSet)
    };
  }

  async function loadMonthlyCalendar() {
    $('#calendar-month-label').textContent = `${currentCalYear}年 ${currentCalMonth + 1}月`;
    const { startCal, endCal, weeks } = getWeeksForMonth(currentCalYear, currentCalMonth);
    try {
      const res = await API.getScheduleBatch(weeks);
      calendarSchedules = (res.success && res.schedules) ? res.schedules : {};
      renderMonthlyCalendar(startCal, endCal);
    } catch (e) {
      showToast('カレンダーの読み込みに失敗しました');
    }
  }

  function renderMonthlyCalendar(startCal, endCal) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const headerCells = ALL_DAY_LABELS.map((lbl, idx) => {
      let cls = '';
      if (idx === 0) cls = ' class="sun-col"';
      else if (idx === 6) cls = ' class="sat-col"';
      return `<th${cls}>${lbl}</th>`;
    }).join('');

    let rowsHtml = '';
    const cur = new Date(startCal);
    while (cur <= endCal) {
      let cellsHtml = '';
      for (let dow = 0; dow < 7; dow++) {
        const isCurrentMonth = cur.getMonth() === currentCalMonth;
        const isToday = cur.getFullYear() === today.getFullYear() &&
                        cur.getMonth() === today.getMonth() &&
                        cur.getDate() === today.getDate();
        const weekStart = getMonday(cur);
        const dayKey = ALL_DAY_KEYS[cur.getDay()];
        const dateStr = formatDateLocal(cur);

        const dayData = (calendarSchedules[weekStart] && calendarSchedules[weekStart][dayKey]) || {};
        const amVal = dayData.am || '';
        const pmVal = dayData.pm || '';

        let cellCls = 'cal-day-cell';
        if (!isCurrentMonth) cellCls += ' other-month';
        if (isToday) cellCls += ' today-cell';
        if (dow === 0) cellCls += ' sun-col';
        if (dow === 6) cellCls += ' sat-col';

        const amHtml = amVal ? `<div class="cal-entry cal-entry-am">☀️${amVal}</div>` : '';
        const pmHtml = pmVal ? `<div class="cal-entry cal-entry-pm">🌙${pmVal}</div>` : '';

        cellsHtml += `
          <td class="${cellCls}" data-date="${dateStr}" data-week="${weekStart}" data-day="${dayKey}">
            <div class="cal-day-num">${cur.getDate()}</div>
            ${amHtml}
            ${pmHtml}
          </td>
        `;
        cur.setDate(cur.getDate() + 1);
      }
      rowsHtml += `<tr>${cellsHtml}</tr>`;
    }

    $('#monthly-calendar-grid').innerHTML = `
      <table class="monthly-cal-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  function openCalendarDayModal(dateStr, weekStart, dayKey) {
    const d = new Date(dateStr + 'T00:00:00');
    const dowLabel = ALL_DAY_LABELS[d.getDay()];
    $('#calendar-day-modal-title').textContent = `📅 ${d.getMonth() + 1}/${d.getDate()}(${dowLabel}) の予定`;
    $('#cal-edit-week-start').value = weekStart;
    $('#cal-edit-day-key').value = dayKey;

    const dayData = (calendarSchedules[weekStart] && calendarSchedules[weekStart][dayKey]) || {};
    $('#cal-edit-am').value = dayData.am || '';
    $('#cal-edit-pm').value = dayData.pm || '';

    $('#calendar-day-modal').classList.remove('hidden');
    setTimeout(() => $('#cal-edit-am').focus(), 100);
  }

  function closeCalendarDayModal() {
    $('#calendar-day-modal').classList.add('hidden');
  }

  async function saveCalendarDayModal() {
    const weekStart = $('#cal-edit-week-start').value;
    const dayKey = $('#cal-edit-day-key').value;
    const amText = $('#cal-edit-am').value.trim();
    const pmText = $('#cal-edit-pm').value.trim();

    if (!calendarSchedules[weekStart]) calendarSchedules[weekStart] = {};
    if (!calendarSchedules[weekStart][dayKey]) calendarSchedules[weekStart][dayKey] = {};
    calendarSchedules[weekStart][dayKey].am = amText;
    calendarSchedules[weekStart][dayKey].pm = pmText;

    try {
      const res = await API.saveSchedule(weekStart, calendarSchedules[weekStart], undefined);
      if (res.success) {
        if (weekStart === currentWeekStart) {
          weeklyData = JSON.parse(JSON.stringify(calendarSchedules[weekStart]));
        }
        closeCalendarDayModal();
        const { startCal, endCal } = getWeeksForMonth(currentCalYear, currentCalMonth);
        renderMonthlyCalendar(startCal, endCal);
        showToast('予定を保存しました');
      } else {
        showToast('保存に失敗しました');
      }
    } catch (e) {
      showToast('保存失敗: ' + (e.message || ''));
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

  // ===== Product Releases =====
  let productReleases = [];

  async function showReleases() {
    showView('releases', '✨ 発売予定');
    await loadReleases();
  }

  async function loadReleases() {
    try {
      const res = await API.getReleases();
      if (res.success) productReleases = res.items || [];
      renderReleases();
    } catch (e) {
      $('#release-list').innerHTML = '<div class="timeline-empty">読み込みに失敗しました</div>';
    }
  }

  function renderReleases() {
    const list = $('#release-list');
    if (productReleases.length === 0) {
      list.innerHTML = '<div class="timeline-empty">登録されている発売予定はありません<br><small style="color:var(--text-muted)">右上の「＋ 追加」から登録できます</small></div>';
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    list.innerHTML = productReleases.map(item => {
      const relDate = new Date(item.release_date + 'T00:00:00');
      const diffMs = relDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let countdownHtml = '';
      let cardExtraClass = '';
      if (diffDays > 7) {
        countdownHtml = `<div class="rel-countdown upcoming"><span class="rel-unit">あと</span>${diffDays}日</div>`;
      } else if (diffDays > 0) {
        countdownHtml = `<div class="rel-countdown soon"><span class="rel-unit">あと</span>${diffDays}日</div>`;
      } else if (diffDays === 0) {
        countdownHtml = `<div class="rel-countdown today">本日<span class="rel-unit">発売日🎉</span></div>`;
      } else {
        countdownHtml = `<div class="rel-countdown past">発売済<span class="rel-unit">${Math.abs(diffDays)}日前</span></div>`;
        cardExtraClass = ' past-release';
      }

      let badgeClass = 'type-new';
      if (item.product_type === '期間限定') badgeClass = 'type-limited';
      else if (item.product_type === 'その他') badgeClass = 'type-other';

      const m = relDate.getMonth() + 1;
      const d = relDate.getDate();
      const dow = dayNames[relDate.getDay()];
      const noteHtml = item.note ? `<div class="rel-note">📝 ${item.note}</div>` : '';

      return `
        <div class="release-card${cardExtraClass}" data-release-id="${item.id}">
          ${countdownHtml}
          <div class="rel-info">
            <div class="rel-top-row">
              <span class="rel-badge ${badgeClass}">${item.product_type}</span>
              <span class="rel-date">発売日: ${relDate.getFullYear()}/${m}/${d}(${dow})</span>
            </div>
            <div class="rel-name">${item.product_name}</div>
            ${noteHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  function openReleaseModal(releaseId) {
    const typeBtns = $$('#release-type-selector .release-type-btn');
    if (releaseId) {
      const item = productReleases.find(r => String(r.id) === String(releaseId));
      if (!item) return;
      $('#release-modal-title').textContent = '✒️ 発売予定を編集';
      $('#release-edit-id').value = item.id;
      $('#release-input-name').value = item.product_name;
      $('#release-input-date').value = item.release_date;
      $('#release-input-note').value = item.note || '';
      typeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === item.product_type);
      });
      $('#btn-release-delete').classList.remove('hidden');
    } else {
      $('#release-modal-title').textContent = '✨ 発売予定を登録';
      $('#release-edit-id').value = '';
      $('#release-input-name').value = '';
      $('#release-input-date').value = '';
      $('#release-input-note').value = '';
      typeBtns.forEach((btn, idx) => {
        btn.classList.toggle('active', idx === 0);
      });
      $('#btn-release-delete').classList.add('hidden');
    }
    $('#release-modal').classList.remove('hidden');
    setTimeout(() => $('#release-input-name').focus(), 100);
  }

  function closeReleaseModal() {
    $('#release-modal').classList.add('hidden');
  }

  async function saveRelease() {
    const name = $('#release-input-name').value.trim();
    const date = $('#release-input-date').value;
    const note = $('#release-input-note').value.trim();
    const activeTypeBtn = $('#release-type-selector .release-type-btn.active');
    const productType = activeTypeBtn ? activeTypeBtn.dataset.type : '新商品';

    if (!name || !date) {
      showToast('商品名と発売日を入力してください');
      return;
    }
    try {
      const editId = $('#release-edit-id').value;
      if (editId) {
        await API.updateRelease(editId, name, date, productType, note);
        showToast('発売予定を更新しました');
      } else {
        await API.createRelease(name, date, productType, note);
        showToast('発売予定を登録しました');
      }
      closeReleaseModal();
      await loadReleases();
    } catch (e) {
      showToast('保存失敗: ' + (e.message || ''));
    }
  }

  async function deleteRelease() {
    const id = $('#release-edit-id').value;
    if (!id) return;
    showConfirm('この発売予定を削除しますか？', async () => {
      try {
        await API.deleteRelease(id);
        showToast('削除しました');
        closeReleaseModal();
        await loadReleases();
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

  function nowTimeStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
      if (currentView === 'calendar') {
        showSchedule();
      } else if (currentView === 'subcategory' && currentSubParent !== null) {
        showSubcategory(currentCatIndex);
      } else {
        showView('main');
      }
    });

    // Category Reorder Mode (Long Press + Drag)
    const categoryGrid = $('#category-grid');
    let pressTimer = null;
    let pressStartX = 0;
    let pressStartY = 0;

    const clearPressTimer = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    const handleDragMove = (clientX, clientY, e) => {
      if (!isDraggingCard || dragSrcIndex === null) return;
      if (e && e.cancelable) e.preventDefault();
      const el = document.elementFromPoint(clientX, clientY);
      const targetCard = el ? el.closest('#category-grid .category-card') : null;
      if (!targetCard) return;
      const targetIdx = parseInt(targetCard.dataset.index);
      if (!isNaN(targetIdx) && targetIdx !== dragSrcIndex) {
        moveCategoryItem(dragSrcIndex, targetIdx);
        dragSrcIndex = targetIdx;
      }
    };

    const finishDrag = () => {
      clearPressTimer();
      if (isDraggingCard) {
        isDraggingCard = false;
        dragSrcIndex = null;
        categoryGrid.querySelectorAll('.category-card.is-dragging').forEach(el => el.classList.remove('is-dragging'));
        saveCategoryOrder();
      }
    };

    categoryGrid.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) {
        clearPressTimer();
        return;
      }
      const card = e.target.closest('.category-card');
      if (!card) return;
      const idx = parseInt(card.dataset.index);
      const touch = e.touches[0];
      pressStartX = touch.clientX;
      pressStartY = touch.clientY;

      if (isReorderMode) {
        dragSrcIndex = idx;
        isDraggingCard = true;
        card.classList.add('is-dragging');
      } else {
        clearPressTimer();
        pressTimer = setTimeout(() => {
          suppressNextClick = true;
          dragSrcIndex = idx;
          isDraggingCard = true;
          enterReorderMode(idx);
        }, 420);
      }
    }, { passive: true });

    categoryGrid.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!isDraggingCard && pressTimer) {
        if (Math.hypot(touch.clientX - pressStartX, touch.clientY - pressStartY) > 10) {
          clearPressTimer();
        }
      }
      if (isDraggingCard) {
        handleDragMove(touch.clientX, touch.clientY, e);
      }
    }, { passive: false });

    categoryGrid.addEventListener('touchend', finishDrag);
    categoryGrid.addEventListener('touchcancel', finishDrag);

    // PC向けマウス長押し＋ドラッグ対応
    categoryGrid.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const card = e.target.closest('.category-card');
      if (!card) return;
      const idx = parseInt(card.dataset.index);
      pressStartX = e.clientX;
      pressStartY = e.clientY;

      if (isReorderMode) {
        dragSrcIndex = idx;
        isDraggingCard = true;
        card.classList.add('is-dragging');
      } else {
        clearPressTimer();
        pressTimer = setTimeout(() => {
          suppressNextClick = true;
          dragSrcIndex = idx;
          isDraggingCard = true;
          enterReorderMode(idx);
        }, 420);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingCard && pressTimer) {
        if (Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY) > 8) {
          clearPressTimer();
        }
      }
      if (isDraggingCard) {
        handleDragMove(e.clientX, e.clientY, e);
      }
    });

    window.addEventListener('mouseup', finishDrag);

    if ($('#btn-reorder-done')) {
      $('#btn-reorder-done').addEventListener('click', exitReorderMode);
    }

    // Category card click
    categoryGrid.addEventListener('click', (e) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (isReorderMode) return;
      const card = e.target.closest('.category-card');
      if (!card) return;
      const idx = parseInt(card.dataset.index);
      const cat = CATEGORIES[idx];
      if (cat.items.length === 0) {
        showNoteDialog(cat.name, cat.name, cat.color);
      } else if (cat.items.length === 1 && typeof cat.items[0] === 'string') {
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
      const item = cat.items[itemIdx];

      if (btn.dataset.subitem !== undefined) {
        const subIdx = parseInt(btn.dataset.subitem);
        const subName = item.subItems[subIdx];
        btn.classList.toggle('active');
        if (btn.classList.contains('active')) {
          if (!selectedSubItems.includes(subName)) selectedSubItems.push(subName);
        } else {
          selectedSubItems = selectedSubItems.filter(s => s !== subName);
        }
        updateSubConfirmBtn();
      } else if (typeof item === 'object' && Array.isArray(item.subItems) && item.subItems.length > 0) {
        showSubSubcategory(catIdx, itemIdx);
      } else {
        const label = typeof item === 'string' ? item : item.name;
        showNoteDialog(cat.name, label, cat.color);
      }
    });

    // Subcategory multi-select confirm button
    if ($('#btn-subcategory-confirm')) {
      $('#btn-subcategory-confirm').addEventListener('click', () => {
        if (currentCatIndex === null || !currentSubParent) return;
        const cat = CATEGORIES[currentCatIndex];
        const subLabel = selectedSubItems.length > 0
          ? `${currentSubParent.name} - ${selectedSubItems.join(', ')}`
          : currentSubParent.name;
        showNoteDialog(cat.name, subLabel, cat.color);
      });
    }

    // Bottom actions
    $('#btn-timeline').addEventListener('click', () => showTimeline());
    $('#btn-schedule').addEventListener('click', () => showSchedule());
    $('#btn-releases').addEventListener('click', () => showReleases());
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

    // ===== Product Releases Events =====
    $('#btn-add-release').addEventListener('click', () => openReleaseModal(null));
    $('#btn-release-cancel').addEventListener('click', closeReleaseModal);
    $('.release-modal-backdrop').addEventListener('click', closeReleaseModal);
    $('#btn-release-save').addEventListener('click', saveRelease);
    $('#btn-release-delete').addEventListener('click', deleteRelease);
    $('#release-type-selector').addEventListener('click', (e) => {
      const btn = e.target.closest('.release-type-btn');
      if (!btn) return;
      $$('#release-type-selector .release-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    $('#release-list').addEventListener('click', (e) => {
      const card = e.target.closest('.release-card');
      if (card) openReleaseModal(card.dataset.releaseId);
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

    // Cell edit modal
    $('#btn-cell-cancel').addEventListener('click', closeCellEdit);
    $('#btn-cell-save').addEventListener('click', saveCellEdit);
    $('.cell-modal-backdrop').addEventListener('click', closeCellEdit);

    // Save weekly
    $('#btn-save-weekly').addEventListener('click', saveWeeklySchedule);

    // Schedule photo (カメラ撮影 & アルバムから添付の両方に対応)
    const onSchedPhotoSelected = (e) => {
      if (e.target.files && e.target.files[0]) {
        compressImage(e.target.files[0], 1600, 0.8).then(dataUrl => {
          schedPhotoData = dataUrl;
          schedPhotoChanged = true;
          resetSchedPhotoZoom();
          $('#sched-photo-img').src = dataUrl;
          $('#sched-photo-preview').classList.remove('hidden');
          $('#btn-copy-photo-next-week').classList.remove('hidden');
        });
      }
    };
    $('#sched-photo-input').addEventListener('change', onSchedPhotoSelected);
    if ($('#sched-photo-camera-input')) {
      $('#sched-photo-camera-input').addEventListener('change', onSchedPhotoSelected);
    }
    $('#btn-sched-photo-remove').addEventListener('click', () => {
      schedPhotoData = '';
      schedPhotoChanged = true;
      resetSchedPhotoZoom();
      $('#sched-photo-img').src = '';
      $('#sched-photo-preview').classList.add('hidden');
      $('#btn-copy-photo-next-week').classList.add('hidden');
      $('#sched-photo-input').value = '';
      if ($('#sched-photo-camera-input')) $('#sched-photo-camera-input').value = '';
    });
    if ($('#btn-sched-photo-zoom-reset')) {
      $('#btn-sched-photo-zoom-reset').addEventListener('click', resetSchedPhotoZoom);
    }
    $('#btn-copy-photo-next-week').addEventListener('click', copyPhotoToNextWeek);

    // スケジュール写真のタップ拡大（全画面ライトボックス）＆ピンチ操作
    let lbScale = 1;
    let lbTx = 0;
    let lbTy = 0;

    function updateLightboxTransform() {
      const img = $('#photo-lightbox-img');
      const resetBtn = $('#btn-lightbox-reset');
      if (!img) return;
      if (lbScale <= 1.01) {
        lbScale = 1;
        lbTx = 0;
        lbTy = 0;
        img.style.transform = '';
        if (resetBtn) resetBtn.classList.add('hidden');
      } else {
        img.style.transform = `translate(${lbTx}px, ${lbTy}px) scale(${lbScale})`;
        if (resetBtn) resetBtn.classList.remove('hidden');
      }
    }

    function resetLightboxZoom() {
      lbScale = 1;
      lbTx = 0;
      lbTy = 0;
      updateLightboxTransform();
    }

    function openPhotoLightbox(src) {
      if (!src) return;
      const lb = $('#photo-lightbox');
      const img = $('#photo-lightbox-img');
      if (!lb || !img) return;
      img.src = src;
      resetLightboxZoom();
      lb.classList.remove('hidden');
    }

    function closePhotoLightbox() {
      const lb = $('#photo-lightbox');
      if (lb) lb.classList.add('hidden');
      resetLightboxZoom();
    }

    if ($('#btn-lightbox-close')) {
      $('#btn-lightbox-close').addEventListener('click', closePhotoLightbox);
    }
    if ($('#btn-lightbox-reset')) {
      $('#btn-lightbox-reset').addEventListener('click', resetLightboxZoom);
    }

    const lbStage = $('#photo-lightbox-stage');
    if (lbStage) {
      let lbPinching = false;
      let lbDragging = false;
      let lbStartDist = 0;
      let lbStartScale = 1;
      let lbDragStartX = 0;
      let lbDragStartY = 0;
      let lbStartTx = 0;
      let lbStartTy = 0;
      let lbLastTap = 0;

      const getDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      lbStage.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          lbPinching = true;
          lbDragging = false;
          lbStartDist = getDist(e.touches[0], e.touches[1]);
          lbStartScale = lbScale;
          lbStartTx = lbTx;
          lbStartTy = lbTy;
        } else if (e.touches.length === 1) {
          const now = Date.now();
          if (now - lbLastTap < 300) {
            e.preventDefault();
            if (lbScale > 1.05) {
              resetLightboxZoom();
            } else {
              lbScale = 2.5;
              lbTx = 0;
              lbTy = 0;
              updateLightboxTransform();
            }
            lbLastTap = 0;
            return;
          }
          lbLastTap = now;
          if (lbScale > 1.01) {
            e.preventDefault();
            lbDragging = true;
            lbDragStartX = e.touches[0].clientX;
            lbDragStartY = e.touches[0].clientY;
            lbStartTx = lbTx;
            lbStartTy = lbTy;
          }
        }
      }, { passive: false });

      lbStage.addEventListener('touchmove', (e) => {
        if (lbPinching && e.touches.length === 2) {
          e.preventDefault();
          const dist = getDist(e.touches[0], e.touches[1]);
          if (lbStartDist > 0) {
            const newScale = Math.min(6, Math.max(1, lbStartScale * (dist / lbStartDist)));
            const ratio = newScale / lbStartScale;
            lbScale = newScale;
            const maxPanX = (lbStage.clientWidth * (lbScale - 1)) / 2 + 80;
            const maxPanY = (lbStage.clientHeight * (lbScale - 1)) / 2 + 80;
            lbTx = Math.min(maxPanX, Math.max(-maxPanX, lbStartTx * ratio));
            lbTy = Math.min(maxPanY, Math.max(-maxPanY, lbStartTy * ratio));
            updateLightboxTransform();
          }
        } else if (lbDragging && e.touches.length === 1 && lbScale > 1.01) {
          e.preventDefault();
          const dx = e.touches[0].clientX - lbDragStartX;
          const dy = e.touches[0].clientY - lbDragStartY;
          const maxPanX = (lbStage.clientWidth * (lbScale - 1)) / 2 + 80;
          const maxPanY = (lbStage.clientHeight * (lbScale - 1)) / 2 + 80;
          lbTx = Math.min(maxPanX, Math.max(-maxPanX, lbStartTx + dx));
          lbTy = Math.min(maxPanY, Math.max(-maxPanY, lbStartTy + dy));
          updateLightboxTransform();
        }
      }, { passive: false });

      lbStage.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
          lbPinching = false;
        }
        if (e.touches.length === 1 && lbScale > 1.01) {
          lbDragging = true;
          lbDragStartX = e.touches[0].clientX;
          lbDragStartY = e.touches[0].clientY;
          lbStartTx = lbTx;
          lbStartTy = lbTy;
        } else if (e.touches.length === 0) {
          lbDragging = false;
          if (lbScale <= 1.02) {
            resetLightboxZoom();
          }
        }
      });

      // PC向けホイール拡大縮小
      lbStage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.15 : 0.87;
        lbScale = Math.min(6, Math.max(1, lbScale * delta));
        updateLightboxTransform();
      }, { passive: false });
    }

    const schedImgEl = $('#sched-photo-img');
    if (schedImgEl) {
      schedImgEl.addEventListener('click', (e) => {
        if (schedZoomScale <= 1.01 && schedImgEl.getAttribute('src')) {
          openPhotoLightbox(schedImgEl.src);
        }
      });
    }

    // スケジュール写真のピンチアウト・ピンチイン拡大縮小 & ドラッグ移動
    const photoWrap = $('#sched-photo-preview');
    if (photoWrap) {
      let startDist = 0;
      let startScale = 1;
      let isPinching = false;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let startTx = 0;
      let startTy = 0;
      let lastTapTime = 0;

      const getTouchDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      photoWrap.addEventListener('touchstart', (e) => {
        if (e.target.closest('button')) return;
        if (e.touches.length === 2) {
          e.preventDefault();
          isPinching = true;
          isDragging = false;
          startDist = getTouchDist(e.touches[0], e.touches[1]);
          startScale = schedZoomScale;
        } else if (e.touches.length === 1) {
          const now = Date.now();
          if (now - lastTapTime < 300) {
            // ダブルタップで拡大・縮小を切り替え
            e.preventDefault();
            if (schedZoomScale > 1.05) {
              resetSchedPhotoZoom();
            } else {
              schedZoomScale = 2.4;
              schedZoomTx = 0;
              schedZoomTy = 0;
              updateSchedPhotoTransform();
            }
            lastTapTime = 0;
            return;
          }
          lastTapTime = now;

          if (schedZoomScale > 1.01) {
            e.preventDefault();
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            startTx = schedZoomTx;
            startTy = schedZoomTy;
          }
        }
      }, { passive: false });

      photoWrap.addEventListener('touchmove', (e) => {
        if (isPinching && e.touches.length === 2) {
          e.preventDefault();
          const dist = getTouchDist(e.touches[0], e.touches[1]);
          if (startDist > 0) {
            schedZoomScale = Math.min(5, Math.max(1, startScale * (dist / startDist)));
            updateSchedPhotoTransform();
          }
        } else if (isDragging && e.touches.length === 1 && schedZoomScale > 1.01) {
          e.preventDefault();
          const dx = e.touches[0].clientX - dragStartX;
          const dy = e.touches[0].clientY - dragStartY;
          const maxPanX = (photoWrap.clientWidth * (schedZoomScale - 1)) / 2 + 40;
          const maxPanY = (photoWrap.clientHeight * (schedZoomScale - 1)) / 2 + 40;
          schedZoomTx = Math.min(maxPanX, Math.max(-maxPanX, startTx + dx));
          schedZoomTy = Math.min(maxPanY, Math.max(-maxPanY, startTy + dy));
          updateSchedPhotoTransform();
        }
      }, { passive: false });

      photoWrap.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
          isPinching = false;
        }
        if (e.touches.length === 1 && schedZoomScale > 1.01) {
          // 2本指から1本指になった時にそのままスムーズにドラッグ移動へ移行
          isDragging = true;
          dragStartX = e.touches[0].clientX;
          dragStartY = e.touches[0].clientY;
          startTx = schedZoomTx;
          startTy = schedZoomTy;
        } else if (e.touches.length === 0) {
          isDragging = false;
          if (schedZoomScale <= 1.02) {
            resetSchedPhotoZoom();
          }
        }
      });
    }

    // ===== Monthly / Yearly Calendar Events =====
    $('#btn-open-calendar').addEventListener('click', openMonthlyCalendar);
    $('#btn-back-to-schedule').addEventListener('click', () => showSchedule());
    $('#btn-month-prev').addEventListener('click', () => {
      currentCalMonth--;
      if (currentCalMonth < 0) {
        currentCalMonth = 11;
        currentCalYear--;
      }
      loadMonthlyCalendar();
    });
    $('#btn-month-next').addEventListener('click', () => {
      currentCalMonth++;
      if (currentCalMonth > 11) {
        currentCalMonth = 0;
        currentCalYear++;
      }
      loadMonthlyCalendar();
    });
    $('#monthly-calendar-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.cal-day-cell');
      if (cell) {
        openCalendarDayModal(cell.dataset.date, cell.dataset.week, cell.dataset.day);
      }
    });
    $('#btn-cal-day-cancel').addEventListener('click', closeCalendarDayModal);
    $('#btn-cal-day-save').addEventListener('click', saveCalendarDayModal);
    $('.calendar-day-modal-backdrop').addEventListener('click', closeCalendarDayModal);

    // ===== Voice Quick Record (Speech Recognition & Smart Classification) =====
    function normalizeVoiceText(str) {
      return (str || '')
        .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/[、。・！？!?\s　]/g, '')
        .toLowerCase();
    }

    const VOICE_RULES = [
      // ビール仕込み補助
      {
        category: 'ビール仕込み補助', subcategory: '麦芽粉砕', color: '#f5c542',
        keys: ['麦芽粉砕', 'ばくがふんさい', '粉砕', 'ふんさい', 'もるとふんさい', 'ばくがをくだく', 'ばくがのふんさい', '爆画粉砕', '麦が粉砕'],
        combos: [[['麦芽', 'ばくが', 'もると', '麦'], ['粉砕', 'ふんさい', '砕', 'くだ', '挽', 'ひく']]]
      },
      {
        category: 'ビール仕込み補助', subcategory: '麦芽粕取り', color: '#f5c542',
        keys: ['麦芽粕取り', '麦芽かす取り', 'かす取り', '粕取り', 'かすとり', '麦芽粕', 'ばくがかす', 'かすだし', '粕出し', 'かすふくろ', '粕袋'],
        combos: [[['麦芽', 'ばくが', 'もると', 'かす', '粕'], ['取', 'と', '出', 'だ', '袋', '片付']]]
      },
      {
        category: 'ビール仕込み補助', subcategory: '麦芽受け入れ', color: '#f5c542',
        keys: ['麦芽受け入れ', '麦芽受入', '受け入れ', '受入', 'うけいれ', 'ばくががとどく', '麦芽到着'],
        combos: [[['麦芽', 'ばくが', 'もると'], ['受', 'うけ', '入', '届', '搬入', '納品']]]
      },
      {
        category: 'ビール仕込み補助', subcategory: '濾過', color: '#f5c542',
        keys: ['濾過', 'ろか', 'ふぃるた', 'ろかさぎょう', '廊下', 'ろうか', '濾過機'],
        combos: [[['びーる', 'ビール', 'さけ', '酒', 'たんく'], ['ろか', '濾過', 'ふぃるた', 'こす']]]
      },
      {
        category: 'ビール仕込み補助', subcategory: 'タンクのガス充填', color: '#f5c542',
        keys: ['タンクのガス充填', 'ガス充填', 'がすじゅうてん', '炭酸ガス', '二酸化炭素', 'がすいれ', 'ガス入れ', 'がすをいれ', 'ガスを入れ'],
        combos: [[['たんく', 'タンク', 'がす', 'ガス', '炭酸'], ['充填', 'じゅうてん', 'いれ', '入れ', '補充']]]
      },
      {
        category: 'ビール仕込み補助', subcategory: '火入れ補助', color: '#f5c542',
        keys: ['火入れ補助', '火入れ', 'ひいれ', 'ひいれほじょ', '日入れ', '殺菌', 'ぱすとらい'],
        combos: [[['火', 'ひ', '日'], ['いれ', '入れ']]]
      },
      {
        category: 'ビール仕込み補助', subcategory: 'タンク洗い補助', color: '#f5c542',
        keys: ['タンク洗い補助', 'タンク洗い', 'タンク洗浄', 'たんくあらい', 'タンク洗', 'たんくせんじょう', 'たんくそうじ', 'タンク掃除'],
        combos: [[['たんく', 'タンク'], ['あら', '洗', '洗浄', 'せんじょう', 'そうじ', '掃除', 'きれい']]]
      },

      // 日本酒仕込み
      {
        category: '日本酒仕込み', subcategory: '洗米', color: '#4db6ac',
        keys: ['洗米', 'せんまい', '米洗い', 'こめあらい', '先まい', '先マイ', '線マイ', '1000枚', '千枚', '専売', 'おこめをあら', '米を洗'],
        combos: [[['米', 'こめ', 'おこめ', 'お米'], ['あら', '洗', 'とぐ', '研']]]
      },
      {
        category: '日本酒仕込み', subcategory: '蒸し米', color: '#4db6ac',
        keys: ['蒸し米', 'むしまい', '蒸米', '蒸し作業', 'むしさぎょう', '虫枚', '無視まい', 'むしこめ', 'こめをむす'],
        combos: [[['米', 'こめ', 'お米'], ['むす', 'むし', '蒸']]]
      },
      {
        category: '日本酒仕込み', subcategory: '引き込み', color: '#4db6ac',
        keys: ['引き込み', 'ひきこみ', '引込', '引込み', '引きこもり', 'ひきこみさぎょう', 'こうじむろにいれ'],
        combos: [[['ひき', '引き'], ['こみ', '込み']]]
      },
      {
        category: '日本酒仕込み', subcategory: '盛り', color: '#4db6ac',
        keys: ['盛り', 'もり', '麹盛り', 'こうじもり', 'もりさぎょう', '盛り作業', '森作業'],
        combos: [[['こうじ', '麹', 'もも', 'もり'], ['もり', '盛り']]]
      },
      {
        category: '日本酒仕込み', subcategory: '出麹', color: '#4db6ac',
        keys: ['出麹', 'でこうじ', '出こうじ', 'でぐち', 'で工事', '手工事', '出工事', '出小路', 'こうじだし', '麹出し'],
        combos: [[['こうじ', '麹'], ['だす', 'だし', '出し', 'でる']]]
      },
      {
        category: '日本酒仕込み', subcategory: '仕込み', color: '#4db6ac',
        keys: ['仕込み', 'しこみ', '日本酒仕込み', 'もろみ', 'しこみさぎょう', '仕込', '酒仕込み'],
        combos: [[['日本酒', 'にほんしゅ', 'もろみ', 'きもと', 'もと'], ['しこ', '仕込']]]
      },
      {
        category: '日本酒仕込み', subcategory: '掛け米', color: '#4db6ac',
        keys: ['掛け米', 'かけまい', '掛米', 'かけ枚', '賭け米', '欠け米', 'かけまいさぎょう'],
        combos: [[['かけ', '掛け', '掛'], ['まい', '米', 'こめ']]]
      },

      // 出荷対応
      {
        category: '出荷対応', subcategory: '朝一出荷対応', color: '#8bc34a',
        keys: ['朝一出荷対応', '朝一出荷', '朝一', 'あさいち', '朝1', '朝いち', 'デリコ', 'でりこ', '朝一番'],
        combos: [[['朝', 'あさ', '早朝'], ['出荷', 'しゅっか', '発送', 'はっそう', '荷物']]]
      },
      {
        category: '出荷対応', subcategory: '県販・個人出荷対応', color: '#8bc34a', isAreaShip: true,
        keys: ['県販・個人出荷対応', '県販出荷', '個人出荷', '県販', 'けんぱん', '検番', '県板', '乾パン', '建販', '個人', 'こじん', '個人発送', '通販出荷', '宅急便', '宅配'],
        combos: [[['出荷', 'しゅっか', '発送', 'はっそう', '梱包', 'こんぽう', '送り'], ['けんぱん', '県販', '個人', 'こじん', 'お客']]]
      },
      {
        category: '出荷対応', subcategory: '配達', color: '#8bc34a',
        keys: ['配達', 'はいたつ', '配送', 'はいそう', '届け', 'とどけ', '納品', 'のうひん', 'もっていく', '持っていく'],
        combos: [[['車', 'くるま', 'トラック', '軽トラ', '店', 'みせ'], ['とどけ', '届', '配達', 'はいたつ', '納品']]]
      },

      // 在庫作り
      {
        category: '在庫作り', subcategory: 'ラベル貼り', color: '#9e9e9e',
        keys: ['ラベル貼り', 'らべるはり', 'ラベル', 'らべる', 'シール貼り', 'しーるはり', 'ラベルつけ'],
        combos: [[['らべる', 'ラベル', 'しーる', 'シール'], ['は', '貼', 'つけ', '付']]]
      },
      {
        category: '在庫作り', subcategory: '箱詰め作業', color: '#9e9e9e',
        keys: ['箱詰め作業', '箱詰め', 'はこづめ', '箱詰', 'はこつめ', '箱作り', 'はこづくり', 'だんぼーる', '段ボール'],
        combos: [[['はこ', '箱', 'けーす', 'ケース', '段ボール'], ['つ', '詰', 'つく', '作', 'おる', '折']]]
      },
      {
        category: '在庫作り', subcategory: 'その他', color: '#9e9e9e',
        keys: ['在庫作り', 'ざいこづくり', '在庫', 'ざいこ', '商品準備']
      },

      // 詰め作業
      {
        category: '詰め作業', subcategory: '缶ビール', color: '#42a5f5',
        keys: ['缶ビール', 'かんびーる', '缶詰め', '缶詰', 'かんづめ', 'かんつめ', '缶の詰め', 'かんびーるつめ', 'かん'],
        combos: [[['かん', '缶'], ['つめ', '詰', 'びーる', 'ビール']]]
      },
      {
        category: '詰め作業', subcategory: '瓶ビール', color: '#42a5f5',
        keys: ['瓶ビール', 'びんびーる', '瓶詰め', '瓶詰', 'びんづめ', 'びんつめ', '瓶の詰め', 'びんびーるつめ', '洗瓶', 'せんびん'],
        combos: [[['びん', '瓶'], ['つめ', '詰', 'びーる', 'ビール', 'あら', '洗']]]
      },
      {
        category: '詰め作業', subcategory: 'ビールPET', color: '#42a5f5',
        keys: ['ビールpet', 'ぺっとぼとる', 'ペットボトル', 'ぺっと', 'pet詰め', 'petつめ'],
        combos: [[['ぺっと', 'pet'], ['つめ', '詰', 'びーる', 'ビール']]]
      },
      {
        category: '詰め作業', subcategory: '日本酒', color: '#42a5f5',
        keys: ['日本酒詰め', '日本酒の詰め', '一升瓶', 'いっしょうびん', '四合瓶', 'しごうびん', '720ml', '300ml', '1.8l', '酒詰め'],
        combos: [[['日本酒', 'にほんしゅ', 'お酒', 'おさけ', '一升', '四合'], ['つめ', '詰', 'びんづめ', '瓶詰']]]
      },

      // その他共通
      {
        category: 'その他共通', subcategory: '会議・打ち合わせ', color: '#e0e0e0',
        keys: ['会議・打ち合わせ', '会議', 'かいぎ', '打ち合わせ', 'うちあわせ', '打合せ', 'みーてぃんぐ', 'ミーティング', '朝会', 'ちょうかい', '朝礼', '面談', '相談', 'そうだん', '話し合い']
      },
      {
        category: 'その他共通', subcategory: '休憩', color: '#e0e0e0',
        keys: ['休憩', 'きゅうけい', '休み', 'やすみ', '昼休み', 'ひるやすみ', 'ランチ', 'らんち', '昼飯', 'ひるめし', 'お昼', 'おひる', '一服', 'いっぷく', 'お茶']
      },
      {
        category: 'その他共通', subcategory: '売店', color: '#e0e0e0',
        keys: ['売店', 'ばいてん', '閉店', '回転', 'しょっぷ', 'ショップ', '店頭', 'てんとう', '接客', 'せっきゃく', 'レジ', 'れじ', 'お店', 'おみせ', 'お土産', '試飲']
      },
      {
        category: 'その他共通', subcategory: '事務関係', color: '#e0e0e0',
        keys: ['事務関係', '事務', 'じむ', '経理', 'けいり', '伝票', 'でんぴょう', 'ぱそこん', 'パソコン', 'pc', 'メール', 'めーる', '電話', 'でんわ', '請求書', '発注', 'はっちゅう', '入力']
      },
      {
        category: 'その他共通', subcategory: '資料作成', color: '#e0e0e0',
        keys: ['資料作成', 'しりょうさくせい', '資料', 'しりょう', '書類作成', 'しょるい', 'えくせる', 'エクセル', '報告書', 'ほうこくしょ', '見積書', 'みつもり', '稟議書', '規格書']
      },
      {
        category: 'その他共通', subcategory: '運搬', color: '#e0e0e0',
        keys: ['運搬', 'うんぱん', '移動', 'いどう', '積み込み', 'つみこみ', '荷物運び', 'にもつはこび', '運び', 'はこび', 'はこぶ', '運ぶ', 'ふぉーく', 'フォーク', '軽トラ', 'けいとら', '積み上げ', 'つみあげ', '下ろし', 'おろし'],
        combos: [[['ぱれっと', 'パレット', 'p箱', 'けーす', 'ケース', '荷物', '製品', '資材', 'びん', 'かん'], ['はこ', '運', 'もってい', '移動', 'つみ', '積', 'おろ', '下ろ']]]
      }
    ];

    const AREA_ALIASES = [
      { name: '長野', keys: ['長野', 'ながの'] },
      { name: '松本', keys: ['松本', 'まつもと'] },
      { name: '上田', keys: ['上田', 'うえだ'] },
      { name: '飯田', keys: ['飯田', 'いいだ', '飯だ', 'いーだ'] },
      { name: '諏訪', keys: ['諏訪', 'すわ', '座'] },
      { name: '佐久', keys: ['佐久', 'さく', '柵'] },
      { name: '伊那', keys: ['伊那', 'いな', '稲'] }
    ];

    function extractTimeFromVoice(text) {
      const normalized = text.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
      let m = normalized.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
      if (m) {
        const h = Math.min(23, parseInt(m[1], 10));
        const min = Math.min(59, parseInt(m[2], 10));
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      }
      m = normalized.match(/(午後|午前)?\s*(\d{1,2})\s*時\s*(?:(\d{1,2})\s*分|(半))?/);
      if (m) {
        let h = parseInt(m[2], 10);
        if (m[1] === '午後' && h < 12) h += 12;
        if (m[1] === '午前' && h === 12) h = 0;
        let min = 0;
        if (m[3]) min = Math.min(59, parseInt(m[3], 10));
        else if (m[4]) min = 30;
        h = Math.min(23, h);
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      }
      return nowTimeStr();
    }

    function extractCoworkersFromVoice(text) {
      const found = [];
      COWORKERS.forEach(name => {
        if (name === '林(麗)') {
          if (text.includes('林')) found.push(name);
        } else if (text.includes(name)) {
          found.push(name);
        }
      });
      return found.length > 0 ? found.join(', ') : null;
    }

    function rankVoiceCandidates(texts) {
      const altList = Array.isArray(texts) ? texts : [texts];
      const primaryText = (altList[0] || '').trim();
      const allNorm = altList.map(t => normalizeVoiceText(t));

      // 地域名抽出（全候補から）
      const matchedAreas = [];
      AREA_ALIASES.forEach(a => {
        const hit = a.keys.some(k => {
          const nk = normalizeVoiceText(k);
          return allNorm.some(nt => nt.includes(nk));
        });
        if (hit && !matchedAreas.includes(a.name)) {
          matchedAreas.push(a.name);
        }
      });

      const scored = [];
      VOICE_RULES.forEach(rule => {
        let score = 0;
        // キーワード一致（文字数に応じた重み）
        rule.keys.forEach(k => {
          const nk = normalizeVoiceText(k);
          if (!nk) return;
          altList.forEach((raw, idx) => {
            const nt = allNorm[idx];
            if (nt.includes(nk)) {
              const weight = idx === 0 ? 1 : 0.85; // 第1候補をやや優先
              score = Math.max(score, Math.round(nk.length * 10 * weight));
            }
          });
        });

        // 意味の組み合わせパターン一致
        if (Array.isArray(rule.combos)) {
          rule.combos.forEach(([groupA, groupB]) => {
            allNorm.forEach((nt, idx) => {
              const hitA = groupA.some(w => nt.includes(normalizeVoiceText(w)));
              const hitB = groupB.some(w => nt.includes(normalizeVoiceText(w)));
              if (hitA && hitB) {
                const comboScore = idx === 0 ? 45 : 38;
                score = Math.max(score, comboScore);
              }
            });
          });
        }

        // 地域名が入っていて出荷系の場合のボーナス
        if (rule.isAreaShip && matchedAreas.length > 0) {
          score += 30;
        }

        if (score > 0) {
          let sub = rule.subcategory;
          if (rule.isAreaShip && matchedAreas.length > 0) {
            sub = `県販・個人出荷対応 - ${matchedAreas.join(', ')}`;
          }
          scored.push({
            category: rule.category,
            subcategory: sub,
            color: rule.color,
            score
          });
        }
      });

      scored.sort((a, b) => b.score - a.score);

      // 重複を除去して上位3件＋「その他」を用意
      const candidates = [];
      const seen = new Set();
      scored.forEach(item => {
        const key = `${item.category}::${item.subcategory}`;
        if (!seen.has(key) && candidates.length < 3) {
          seen.add(key);
          candidates.push(item);
        }
      });

      const otherKey = 'その他共通::その他';
      if (!seen.has(otherKey)) {
        candidates.push({ category: 'その他共通', subcategory: 'その他', color: '#e0e0e0', score: 0 });
      }

      return {
        primaryText,
        candidates,
        coWorkers: extractCoworkersFromVoice(altList.join(' ')),
        startTime: extractTimeFromVoice(primaryText)
      };
    }

    let voiceRecognition = null;
    let isVoiceListening = false;
    let voiceModalOpen = false;
    let voiceSessionId = 0;
    let voiceCurrentAlts = [];
    let voiceSubmitted = false;
    let voiceAutoTimer = null;
    let voiceSelectedCand = null;
    let voiceParsedMeta = null;

    function clearVoiceAutoTimer() {
      if (voiceAutoTimer) {
        clearInterval(voiceAutoTimer);
        voiceAutoTimer = null;
      }
    }

    function teardownVoiceRecognition(useAbort = false) {
      if (!voiceRecognition) {
        isVoiceListening = false;
        return;
      }
      const oldRec = voiceRecognition;
      voiceRecognition = null;
      isVoiceListening = false;
      // 古いイベントハンドラをすべて切り離してから停止する（2回目との競合を完全に防ぐ）
      oldRec.onstart = null;
      oldRec.onresult = null;
      oldRec.onerror = null;
      oldRec.onend = null;
      try {
        if (useAbort) oldRec.abort();
        else oldRec.stop();
      } catch (e) { /* ignore */ }
    }

    function startFreshVoiceRecognitionSync(sessionId) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return false;

      // 既存インスタンスが残っていればイベントを外して正常終了させる
      teardownVoiceRecognition(false);

      const rec = new SpeechRecognition();
      rec.lang = 'ja-JP';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        if (sessionId !== voiceSessionId || !voiceModalOpen) {
          try { rec.stop(); } catch (e) { /* ignore */ }
          return;
        }
        isVoiceListening = true;
        $('#voice-pulse-wrap').classList.remove('stopped');
        $('#voice-status-text').textContent = '🎤 聞き取り中... お話しください';
      };

      rec.onresult = (event) => {
        if (sessionId !== voiceSessionId || !voiceModalOpen || voiceSubmitted) return;
        let interim = '';
        let finalAlts = [];
        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            for (let a = 0; a < res.length; a++) {
              if (res[a].transcript) finalAlts.push(res[a].transcript.trim());
            }
          } else {
            interim += res[0].transcript;
          }
        }
        const display = (finalAlts[0] || interim).trim();
        if (display) {
          voiceCurrentAlts = finalAlts.length > 0 ? finalAlts : [display];
          const boxEl = $('#voice-transcript-box');
          boxEl.textContent = display;
          boxEl.classList.add('has-text');
        }
        if (finalAlts.length > 0) {
          $('#voice-pulse-wrap').classList.add('stopped');
          // 確定したら正常に stop() させてOS側でセッションを綺麗に閉じさせる
          try { rec.stop(); } catch (e) { /* ignore */ }
          showVoiceCandidates(finalAlts, true);
        }
      };

      rec.onerror = (event) => {
        if (voiceRecognition === rec) {
          isVoiceListening = false;
        }
        if (sessionId !== voiceSessionId || !voiceModalOpen || voiceSubmitted) return;
        if (event.error === 'aborted') return;

        $('#voice-pulse-wrap').classList.add('stopped');
        const statusEl = $('#voice-status-text');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          statusEl.textContent = 'マイク許可が必要です（下の欄からも入力可）';
        } else if (event.error === 'no-speech') {
          statusEl.textContent = '音声が検出されませんでした（🎤タップで再試行）';
        } else {
          statusEl.textContent = '音声認識エラー（🎤タップで再試行 / 下の欄からも入力可）';
        }
      };

      rec.onend = () => {
        if (voiceRecognition === rec) {
          voiceRecognition = null;
          isVoiceListening = false;
        }
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;

        if (sessionId !== voiceSessionId || !voiceModalOpen || voiceSubmitted) return;
        $('#voice-pulse-wrap').classList.add('stopped');
        if (voiceCurrentAlts.length > 0 && $('#voice-result-panel').classList.contains('hidden')) {
          showVoiceCandidates(voiceCurrentAlts, true);
        } else if (voiceCurrentAlts.length === 0 && $('#voice-result-panel').classList.contains('hidden')) {
          $('#voice-status-text').textContent = '🎤 アイコンをタップしてもう一度話す';
        }
      };

      voiceRecognition = rec;
      $('#voice-status-text').textContent = '🎤 マイクを起動中...';
      $('#voice-pulse-wrap').classList.remove('stopped');

      // 重要: iOS Safariではユーザータップと完全に同期して start() を呼ぶ必要がある
      try {
        rec.start();
        return true;
      } catch (e) {
        teardownVoiceRecognition(true);
        $('#voice-pulse-wrap').classList.add('stopped');
        $('#voice-status-text').textContent = '🎤 アイコンをタップして開始してください';
        return false;
      }
    }

    function closeVoiceModal() {
      voiceModalOpen = false;
      voiceSessionId++;
      clearVoiceAutoTimer();
      teardownVoiceRecognition(false);
      $('#voice-modal').classList.add('hidden');
      $('#voice-pulse-wrap').classList.add('stopped');
    }

    async function executeVoiceSave() {
      if (voiceSubmitted || !voiceSelectedCand) return;
      const fallbackVal = $('#voice-fallback-input') ? $('#voice-fallback-input').value.trim() : '';
      const rawText = fallbackVal || (voiceCurrentAlts[0] || '').trim();
      if (!rawText) {
        showToast('音声または文字が入力されていません');
        return;
      }
      voiceSubmitted = true;
      const cand = voiceSelectedCand;
      const meta = voiceParsedMeta || { coWorkers: null, startTime: nowTimeStr() };
      closeVoiceModal();

      try {
        const res = await API.createRecord(
          cand.category,
          cand.subcategory,
          cand.color,
          `🎤 ${rawText}`,
          meta.coWorkers,
          meta.startTime
        );
        if (res.success) {
          showToast(`🎤 ${cand.category} - ${cand.subcategory} (${meta.startTime}〜)`);
          checkCurrentWork();
        }
      } catch (e) {
        showToast('音声記録の保存に失敗しました');
      }
    }

    function showVoiceCandidates(texts, autoStartCountdown = true) {
      const parsed = rankVoiceCandidates(texts);
      voiceParsedMeta = { coWorkers: parsed.coWorkers, startTime: parsed.startTime };
      voiceSelectedCand = parsed.candidates[0];

      const panel = $('#voice-result-panel');
      const candWrap = $('#voice-candidates');
      const metaEl = $('#voice-meta-info');
      const statusEl = $('#voice-status-text');
      const submitBtn = $('#btn-voice-submit');

      candWrap.innerHTML = parsed.candidates.map((c, idx) => `
        <button type="button" class="voice-cand-btn${idx === 0 ? ' active' : ''}" data-cand-idx="${idx}">
          <span class="voice-cand-dot" style="background:${c.color}"></span>
          <span>${c.category} - ${c.subcategory}</span>
        </button>
      `).join('');

      candWrap.querySelectorAll('.voice-cand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          clearVoiceAutoTimer();
          const i = parseInt(btn.dataset.candIdx, 10);
          voiceSelectedCand = parsed.candidates[i];
          candWrap.querySelectorAll('.voice-cand-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          submitBtn.textContent = 'この項目で登録';
          statusEl.textContent = '項目を選択しました';
        });
      });

      const metaParts = [`⏰ ${parsed.startTime}`];
      if (parsed.coWorkers) metaParts.push(`👥 ${parsed.coWorkers}`);
      metaEl.textContent = metaParts.join('　');
      panel.classList.remove('hidden');

      clearVoiceAutoTimer();
      if (autoStartCountdown) {
        let sec = 2;
        statusEl.textContent = `まもなく自動登録します (${sec}秒)`;
        submitBtn.textContent = '今すぐ登録';
        voiceAutoTimer = setInterval(() => {
          sec--;
          if (sec <= 0) {
            clearVoiceAutoTimer();
            executeVoiceSave();
          } else {
            statusEl.textContent = `まもなく自動登録します (${sec}秒)`;
          }
        }, 1000);
      } else {
        statusEl.textContent = '登録する項目を確認してください';
        submitBtn.textContent = '登録する';
      }
    }

    function openVoiceModal() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      clearVoiceAutoTimer();
      voiceModalOpen = true;
      voiceSessionId++;
      const mySessionId = voiceSessionId;
      voiceCurrentAlts = [];
      voiceSubmitted = false;
      voiceSelectedCand = null;
      voiceParsedMeta = null;

      const modal = $('#voice-modal');
      const statusEl = $('#voice-status-text');
      const boxEl = $('#voice-transcript-box');
      const pulseEl = $('#voice-pulse-wrap');
      const resultPanel = $('#voice-result-panel');
      const fallbackInput = $('#voice-fallback-input');
      const submitBtn = $('#btn-voice-submit');

      boxEl.textContent = '例：「洗米始めます」「タンクの中を洗います」「長野と松本に出荷」';
      boxEl.classList.remove('has-text');
      resultPanel.classList.add('hidden');
      fallbackInput.value = '';
      submitBtn.textContent = '登録する';
      modal.classList.remove('hidden');

      if (!SpeechRecognition) {
        pulseEl.classList.add('stopped');
        statusEl.textContent = '下の入力欄（キーボードの🎤も可）から入力してください';
        setTimeout(() => fallbackInput.focus(), 100);
        return;
      }

      startFreshVoiceRecognitionSync(mySessionId);
    }

    // マイクアイコンをタップしたら何度でも同期的にやり直せるようにする
    if ($('#voice-pulse-wrap')) {
      $('#voice-pulse-wrap').style.cursor = 'pointer';
      $('#voice-pulse-wrap').addEventListener('click', () => {
        if (!voiceModalOpen) return;
        clearVoiceAutoTimer();
        voiceCurrentAlts = [];
        voiceSelectedCand = null;
        $('#voice-result-panel').classList.add('hidden');
        $('#voice-transcript-box').textContent = 'お話しください...';
        $('#voice-transcript-box').classList.remove('has-text');
        voiceSessionId++;
        startFreshVoiceRecognitionSync(voiceSessionId);
      });
    }

    if ($('#voice-fallback-input')) {
      $('#voice-fallback-input').addEventListener('input', (e) => {
        clearVoiceAutoTimer();
        const val = e.target.value.trim();
        if (val) {
          voiceCurrentAlts = [val];
          $('#voice-transcript-box').textContent = val;
          $('#voice-transcript-box').classList.add('has-text');
          showVoiceCandidates([val], false);
        } else {
          $('#voice-result-panel').classList.add('hidden');
        }
      });
    }

    if ($('#btn-voice-record')) {
      $('#btn-voice-record').addEventListener('click', openVoiceModal);
    }
    if ($('#btn-voice-cancel')) {
      $('#btn-voice-cancel').addEventListener('click', closeVoiceModal);
    }
    if ($('.voice-modal-backdrop')) {
      $('.voice-modal-backdrop').addEventListener('click', closeVoiceModal);
    }
    if ($('#btn-voice-submit')) {
      $('#btn-voice-submit').addEventListener('click', () => {
        clearVoiceAutoTimer();
        const fallbackVal = $('#voice-fallback-input') ? $('#voice-fallback-input').value.trim() : '';
        if (!voiceSelectedCand && (fallbackVal || voiceCurrentAlts.length > 0)) {
          showVoiceCandidates(fallbackVal ? [fallbackVal] : voiceCurrentAlts, false);
        }
        executeVoiceSave();
      });
    }
  }

  // ===== Start =====
  document.addEventListener('DOMContentLoaded', init);
})();
