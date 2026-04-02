/**
 * Message Persistence Store
 * better-sqlite3-backed message storage
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || "/app/data/messages.db";

class MessageStore {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    const dir = path.dirname(DB_PATH);
    fs.mkdirSync(dir, { recursive: true });
    
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE,
        from_agent TEXT,
        to_agent TEXT,
        type TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_from_agent ON messages(from_agent);
      CREATE INDEX IF NOT EXISTS idx_type ON messages(type);
    `);
    
    console.log("Message store initialized at " + DB_PATH);
  }

  store(message) {
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO messages (message_id, from_agent, to_agent, type, content) VALUES (?, ?, ?, ?, ?)"
    );
    stmt.run(message.id || Date.now().toString(), message.from, message.to, message.type, JSON.stringify(message));
  }

  query(filters = {}) {
    let sql = "SELECT * FROM messages WHERE 1=1";
    const params = [];
    
    if (filters.from) { sql += " AND from_agent = ?"; params.push(filters.from); }
    if (filters.type) { sql += " AND type = ?"; params.push(filters.type); }
    if (filters.since) { sql += " AND timestamp > ?"; params.push(filters.since); }
    
    sql += " ORDER BY timestamp DESC LIMIT ?";
    params.push(filters.limit || 100);
    
    return this.db.prepare(sql).all(...params);
  }

  cleanup(days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare("DELETE FROM messages WHERE timestamp < ?").run(cutoff);
    return result.changes;
  }

  getStats() {
    const total = this.db.prepare("SELECT COUNT(*) as count FROM messages").get().count;
    const byType = this.db.prepare("SELECT type, COUNT(*) as count FROM messages GROUP BY type").all();
    return { total, byType };
  }
}

module.exports = MessageStore;
