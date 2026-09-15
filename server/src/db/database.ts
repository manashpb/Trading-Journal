import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'trading.db');

export class Database {
  private db: sqlite3.Database;

  constructor() {
    if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new sqlite3.Database(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  initialize() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS instruments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          type TEXT CHECK(type IN ('CFD', 'Futures')) NOT NULL,
          pointValue REAL NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS tag_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          categoryId INTEGER NOT NULL,
          name TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (categoryId) REFERENCES tag_categories(id) ON DELETE CASCADE,
          UNIQUE(categoryId, name)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          instrumentId INTEGER NOT NULL,
          direction TEXT CHECK(direction IN ('Long', 'Short')) NOT NULL,
          contractType TEXT CHECK(contractType IN ('CFD', 'Futures')) NOT NULL,
          entryDateTime TEXT NOT NULL,
          entryPrice REAL NOT NULL,
          slPrice REAL,
          targetPrice REAL,
          quantity REAL NOT NULL,
          exitDateTime TEXT,
          exitPrice REAL,
          status TEXT CHECK(status IN ('Open', 'Closed')) DEFAULT 'Open',
          pnl REAL,
          comments TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (instrumentId) REFERENCES instruments(id)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS trade_tags (
          tradeId INTEGER NOT NULL,
          tagId INTEGER NOT NULL,
          PRIMARY KEY (tradeId, tagId),
          FOREIGN KEY (tradeId) REFERENCES trades(id) ON DELETE CASCADE,
          FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS trade_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tradeId INTEGER NOT NULL,
          filePath TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tradeId) REFERENCES trades(id) ON DELETE CASCADE
        )
      `);

      console.log('Database initialized');
    });
  }

  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => (err ? reject(err) : resolve()));
    });
  }
}