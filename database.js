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
      note TEXT,
      photo TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  // 既存テーブルにnoteカラムがない場合は追加
  try {
    await db.execute('ALTER TABLE work_records ADD COLUMN note TEXT');
  } catch (e) {
    // カラムが既に存在する場合は無視
  }
  // 既存テーブルにphotoカラムがない場合は追加
  try {
    await db.execute('ALTER TABLE work_records ADD COLUMN photo TEXT');
  } catch (e) {
    // カラムが既に存在する場合は無視
  }
  await db.execute('CREATE INDEX IF NOT EXISTS idx_work_records_date ON work_records(date)');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS weekly_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL UNIQUE,
      schedule_data TEXT NOT NULL DEFAULT '{}',
      photo TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS brew_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_order INTEGER NOT NULL DEFAULT 0,
      brew_date TEXT,
      beer_type TEXT,
      brew_number TEXT,
      color TEXT DEFAULT '#f5c542',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS filtration_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_order INTEGER NOT NULL DEFAULT 0,
      beer_type TEXT,
      brew_number TEXT,
      filtration_date TEXT,
      note TEXT,
      color TEXT DEFAULT '#f5c542',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
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
