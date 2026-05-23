const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, queryAll, queryOne, execute } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ==================== API ROUTES ====================

app.post('/api/records', async (req, res) => {
  try {
    const { category, subcategory, color, note } = req.body;
    const now = new Date();
    const date = formatDate(now);
    const startTime = formatTime(now);

    const openRecord = await queryOne(
      'SELECT * FROM work_records WHERE date = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1', [date]
    );

    let closedPrevious = null;
    if (openRecord) {
      const duration = calcDuration(openRecord.start_time, startTime);
      await execute('UPDATE work_records SET end_time = ?, duration_minutes = ? WHERE id = ?',
        [startTime, duration, openRecord.id]);
      closedPrevious = { id: openRecord.id, category: openRecord.category, subcategory: openRecord.subcategory, endTime: startTime };
    }

    await execute('INSERT INTO work_records (date, category, subcategory, color, start_time, note) VALUES (?, ?, ?, ?, ?, ?)',
      [date, category, subcategory || null, color, startTime, note || null]);

    res.json({
      success: true,
      message: `${category}${subcategory ? ' - ' + subcategory : ''} を記録しました`,
      closedPrevious
    });
  } catch (err) {
    console.error('記録作成エラー:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/records', async (req, res) => {
  try {
    const date = req.query.date || formatDate(new Date());
    const records = await queryAll('SELECT * FROM work_records WHERE date = ? ORDER BY start_time ASC', [date]);
    res.json({ success: true, records, date });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/records/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { start_time, end_time, note, photo } = req.body;
    const record = await queryOne('SELECT * FROM work_records WHERE id = ?', [id]);
    if (!record) return res.status(404).json({ success: false, error: '記録が見つかりません' });

    const newStart = start_time || record.start_time;
    const newEnd = end_time !== undefined ? (end_time || null) : record.end_time;
    const duration = newEnd ? calcDuration(newStart, newEnd) : null;
    const newNote = note !== undefined ? (note || null) : record.note;
    const newPhoto = photo !== undefined ? (photo || null) : record.photo;

    await execute('UPDATE work_records SET start_time = ?, end_time = ?, duration_minutes = ?, note = ?, photo = ? WHERE id = ?',
      [newStart, newEnd, duration, newNote, newPhoto, id]);
    res.json({ success: true, message: '記録を更新しました' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/records/:id', async (req, res) => {
  try {
    const result = await execute('DELETE FROM work_records WHERE id = ?', [Number(req.params.id)]);
    if (result.changes === 0) return res.status(404).json({ success: false, error: '記録が見つかりません' });
    res.json({ success: true, message: '記録を削除しました' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/records/end-work', async (req, res) => {
  try {
    const now = new Date();
    const date = formatDate(now);
    const endTime = formatTime(now);

    const openRecord = await queryOne(
      'SELECT * FROM work_records WHERE date = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1', [date]
    );
    if (openRecord) {
      const duration = calcDuration(openRecord.start_time, endTime);
      await execute('UPDATE work_records SET end_time = ?, duration_minutes = ? WHERE id = ?',
        [endTime, duration, openRecord.id]);
    }

    const summary = await queryAll(`
      SELECT category, subcategory, color, COUNT(*) as count,
        SUM(duration_minutes) as total_minutes,
        MIN(start_time) as first_start, MAX(end_time) as last_end
      FROM work_records WHERE date = ? AND duration_minutes IS NOT NULL
      GROUP BY category, subcategory ORDER BY total_minutes DESC
    `, [date]);

    const totalMinutes = summary.reduce((s, r) => s + (r.total_minutes || 0), 0);
    const records = await queryAll('SELECT * FROM work_records WHERE date = ? ORDER BY start_time ASC', [date]);

    res.json({ success: true, date, endTime, summary, totalMinutes, records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats/averages', async (req, res) => {
  try {
    const averages = await queryAll(`
      SELECT category, subcategory, color, COUNT(*) as total_count,
        ROUND(AVG(duration_minutes), 1) as avg_minutes,
        ROUND(MIN(duration_minutes), 1) as min_minutes,
        ROUND(MAX(duration_minutes), 1) as max_minutes,
        ROUND(SUM(duration_minutes), 1) as total_minutes
      FROM work_records WHERE duration_minutes IS NOT NULL
      GROUP BY category, subcategory ORDER BY avg_minutes DESC
    `);
    res.json({ success: true, averages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats/monthly', async (req, res) => {
  try {
    const month = req.query.month || formatMonth(new Date());
    const averages = await queryAll(`
      SELECT category, subcategory, color, COUNT(*) as total_count,
        ROUND(AVG(duration_minutes), 1) as avg_minutes,
        ROUND(MIN(duration_minutes), 1) as min_minutes,
        ROUND(MAX(duration_minutes), 1) as max_minutes,
        ROUND(SUM(duration_minutes), 1) as total_minutes
      FROM work_records WHERE duration_minutes IS NOT NULL AND date LIKE ? || '%'
      GROUP BY category, subcategory ORDER BY avg_minutes DESC
    `, [month]);
    res.json({ success: true, month, averages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== SCHEDULE API ====================

// 週間スケジュール取得
app.get('/api/schedule', async (req, res) => {
  try {
    const week = req.query.week;
    if (!week) return res.status(400).json({ success: false, error: 'week parameter required' });
    const record = await queryOne('SELECT * FROM weekly_schedules WHERE week_start = ?', [week]);
    if (record) {
      res.json({ success: true, schedule: { ...record, schedule_data: JSON.parse(record.schedule_data || '{}') } });
    } else {
      res.json({ success: true, schedule: null });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 週間スケジュール保存
app.put('/api/schedule', async (req, res) => {
  try {
    const { week_start, schedule_data, photo } = req.body;
    if (!week_start) return res.status(400).json({ success: false, error: 'week_start required' });
    const existing = await queryOne('SELECT * FROM weekly_schedules WHERE week_start = ?', [week_start]);
    const dataStr = JSON.stringify(schedule_data || {});
    if (existing) {
      const newPhoto = photo !== undefined ? photo : existing.photo;
      await execute(`UPDATE weekly_schedules SET schedule_data = ?, photo = ?, updated_at = datetime('now','localtime') WHERE week_start = ?`,
        [dataStr, newPhoto, week_start]);
    } else {
      await execute('INSERT INTO weekly_schedules (week_start, schedule_data, photo) VALUES (?, ?, ?)',
        [week_start, dataStr, photo || null]);
    }
    res.json({ success: true, message: 'スケジュールを保存しました' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 仕込予定取得
app.get('/api/brew-schedules', async (req, res) => {
  try {
    const items = await queryAll('SELECT * FROM brew_schedules ORDER BY row_order ASC');
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 仕込予定一括保存
app.put('/api/brew-schedules', async (req, res) => {
  try {
    const { items } = req.body;
    await execute('DELETE FROM brew_schedules');
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await execute('INSERT INTO brew_schedules (row_order, brew_date, beer_type, brew_number, color) VALUES (?, ?, ?, ?, ?)',
        [i, it.brew_date || null, it.beer_type || null, it.brew_number || null, it.color || '#f5c542']);
    }
    res.json({ success: true, message: '仕込予定を保存しました' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 濾過火入れ予定取得
app.get('/api/filtration-schedules', async (req, res) => {
  try {
    const items = await queryAll('SELECT * FROM filtration_schedules ORDER BY row_order ASC');
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 濾過火入れ予定一括保存
app.put('/api/filtration-schedules', async (req, res) => {
  try {
    const { items } = req.body;
    await execute('DELETE FROM filtration_schedules');
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await execute('INSERT INTO filtration_schedules (row_order, beer_type, brew_number, filtration_date, note, color) VALUES (?, ?, ?, ?, ?, ?)',
        [i, it.beer_type || null, it.brew_number || null, it.filtration_date || null, it.note || null, it.color || '#f5c542']);
    }
    res.json({ success: true, message: '濾過予定を保存しました' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== HELPERS ====================
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatTime(d) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function formatMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function calcDuration(startStr, endStr) {
  const [sh,sm] = startStr.split(':').map(Number);
  const [eh,em] = endStr.split(':').map(Number);
  return (eh*60+em) - (sh*60+sm);
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START ====================
(async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`🍺 醸造所日報アプリ起動中: http://localhost:${PORT}`);
  });
})();
