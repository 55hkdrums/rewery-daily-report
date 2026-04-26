// ===== API Communication Module =====
const API = {
  base: '',

  async request(method, path, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    return res.json();
  },

  createRecord(category, subcategory, color) {
    return this.request('POST', '/api/records', { category, subcategory, color });
  },

  getRecords(date) {
    return this.request('GET', `/api/records?date=${date}`);
  },

  updateRecord(id, startTime, endTime) {
    return this.request('PUT', `/api/records/${id}`, { start_time: startTime, end_time: endTime });
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
  }
};
