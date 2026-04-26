const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

// ローカル開発時はファイル、本番はTursoクラウドを使用
const isProduction = !!process.env.TURSO_DATABASE_URL;

let client;

function getClient() {
  if (client) return client;

  if (isProduction) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    // ローカル開発用: ファイルベースSQLite
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    client = createClient({ url: `file:${path.join(dataDir, 'brewery.db')}` });
  }
  return client;
}

async function initDb() {
  const db = getClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS work_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      color TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_minutes REAL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_work_records_date ON work_records(date)');
  console.log(`📦 DB接続: ${isProduction ? 'Turso Cloud' : 'ローカルファイル'}`);
}

async function queryAll(sql, args = []) {
  const result = await getClient().execute({ sql, args });
  return result.rows;
}

async function queryOne(sql, args = []) {
  const result = await getClient().execute({ sql, args });
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function execute(sql, args = []) {
  const result = await getClient().execute({ sql, args });
  return { changes: result.rowsAffected, lastId: Number(result.lastInsertRowid) };
}

module.exports = { initDb, queryAll, queryOne, execute };
