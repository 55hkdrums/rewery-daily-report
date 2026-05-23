// ===== API Communication Module =====
const API = {
  base: '',

  async request(method, path, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    opts.signal = controller.signal;
    try {
      const res = await fetch(this.base + path, opts);
      clearTimeout(timeout);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') throw new Error('リクエストがタイムアウトしました');
      throw e;
    }
  },

  createRecord(category, subcategory, color, note) {
    return this.request('POST', '/api/records', { category, subcategory, color, note });
  },

  getRecords(date) {
    return this.request('GET', `/api/records?date=${date}`);
  },

  updateRecord(id, startTime, endTime, note, photo) {
    return this.request('PUT', `/api/records/${id}`, { start_time: startTime, end_time: endTime, note, photo });
  },

  deleteRecord(id) {
    return this.request('DELETE', `/api/records/${id}`);
  },

  endWork() {
    return this.request('POST', '/api/records/end-work');
  },

  getAverages() {
    return this.request('GET', '/api/stats/averages');
  },

  getMonthlyAverages(month) {
    return this.request('GET', `/api/stats/monthly?month=${month}`);
  },

  getSchedule(weekStart) {
    return this.request('GET', `/api/schedule?week=${weekStart}`);
  },

  saveSchedule(weekStart, scheduleData, photo) {
    return this.request('PUT', '/api/schedule', { week_start: weekStart, schedule_data: scheduleData, photo });
  },

  getBrewSchedules() {
    return this.request('GET', '/api/brew-schedules');
  },

  saveBrewSchedules(items) {
    return this.request('PUT', '/api/brew-schedules', { items });
  },

  getFiltrationSchedules() {
    return this.request('GET', '/api/filtration-schedules');
  },

  saveFiltrationSchedules(items) {
    return this.request('PUT', '/api/filtration-schedules', { items });
  }
};
