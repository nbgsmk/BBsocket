const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

class StrategyRepository {
  constructor(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS paper_positions (instrument TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS paper_trades (trade_id TEXT PRIMARY KEY, instrument TEXT NOT NULL, exit_time INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS strategy_decisions (decision_key TEXT PRIMARY KEY, open_time INTEGER NOT NULL, instrument TEXT NOT NULL, data TEXT NOT NULL);`);
  }

  savePosition(position) { this.db.prepare('INSERT OR REPLACE INTO paper_positions (instrument, data) VALUES (?, ?)').run(position.instrument, JSON.stringify(position)); }
  deletePosition(instrument) { this.db.prepare('DELETE FROM paper_positions WHERE instrument = ?').run(instrument); }
  saveTrade(trade) { this.db.prepare('INSERT OR REPLACE INTO paper_trades (trade_id, instrument, exit_time, data) VALUES (?, ?, ?, ?)').run(trade.tradeId, trade.instrument, trade.exitTime, JSON.stringify(trade)); }
  saveDecision(decision) { this.db.prepare('INSERT OR IGNORE INTO strategy_decisions (decision_key, open_time, instrument, data) VALUES (?, ?, ?, ?)').run(decision.decisionKey, decision.openTime, decision.instrument, JSON.stringify(decision)); }
  getPositions() { return this.db.prepare('SELECT data FROM paper_positions ORDER BY instrument').all().map(row => JSON.parse(row.data)); }
  getTrades() { return this.db.prepare('SELECT data FROM paper_trades ORDER BY exit_time, trade_id').all().map(row => JSON.parse(row.data)); }
  getDecisions() { return this.db.prepare('SELECT data FROM strategy_decisions ORDER BY open_time, decision_key').all().map(row => JSON.parse(row.data)); }
  close() { this.db.close(); }
}

module.exports = StrategyRepository;
