const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

class StrategyRepository {
  constructor(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  migrate() {
    const exists = name => this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    const hasStrategyKey = name => exists(name) && this.db.prepare(`PRAGMA table_info(${name})`).all().some(column => column.name === 'strategy_key');
    const legacy = ['paper_positions', 'paper_trades', 'strategy_decisions'].filter(name => exists(name) && !hasStrategyKey(name));
    this.db.transaction(() => {
      legacy.forEach(name => this.db.exec(`ALTER TABLE ${name} RENAME TO ${name}_legacy`));
      this.db.exec(`CREATE TABLE IF NOT EXISTS paper_positions (strategy_key TEXT NOT NULL, instrument TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (strategy_key, instrument));
        CREATE TABLE IF NOT EXISTS paper_trades (strategy_key TEXT NOT NULL, trade_id TEXT NOT NULL, instrument TEXT NOT NULL, exit_time INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (strategy_key, trade_id));
        CREATE TABLE IF NOT EXISTS strategy_decisions (strategy_key TEXT NOT NULL, decision_key TEXT PRIMARY KEY, open_time INTEGER NOT NULL, instrument TEXT NOT NULL, data TEXT NOT NULL);`);
      if (legacy.includes('paper_positions')) this.db.exec("INSERT OR IGNORE INTO paper_positions SELECT 'default', instrument, data FROM paper_positions_legacy; DROP TABLE paper_positions_legacy");
      if (legacy.includes('paper_trades')) this.db.exec("INSERT OR IGNORE INTO paper_trades SELECT 'default', trade_id, instrument, exit_time, data FROM paper_trades_legacy; DROP TABLE paper_trades_legacy");
      if (legacy.includes('strategy_decisions')) this.db.exec("INSERT OR IGNORE INTO strategy_decisions SELECT 'default', decision_key, open_time, instrument, data FROM strategy_decisions_legacy; DROP TABLE strategy_decisions_legacy");
    })();
  }

  savePosition(position, strategyKey = 'default') { this.db.prepare('INSERT OR REPLACE INTO paper_positions (strategy_key, instrument, data) VALUES (?, ?, ?)').run(strategyKey, position.instrument, JSON.stringify(position)); }
  deletePosition(instrument, strategyKey = 'default') { this.db.prepare('DELETE FROM paper_positions WHERE strategy_key = ? AND instrument = ?').run(strategyKey, instrument); }
  saveTrade(trade, strategyKey = 'default') { this.db.prepare('INSERT OR REPLACE INTO paper_trades (strategy_key, trade_id, instrument, exit_time, data) VALUES (?, ?, ?, ?, ?)').run(strategyKey, trade.tradeId, trade.instrument, trade.exitTime, JSON.stringify(trade)); }
  saveDecision(decision, strategyKey = 'default') { this.db.prepare('INSERT OR IGNORE INTO strategy_decisions (strategy_key, decision_key, open_time, instrument, data) VALUES (?, ?, ?, ?, ?)').run(strategyKey, decision.decisionKey, decision.openTime, decision.instrument, JSON.stringify(decision)); }
  getPositions(strategyKey = 'default') { return this.db.prepare('SELECT data FROM paper_positions WHERE strategy_key = ? ORDER BY instrument').all(strategyKey).map(row => JSON.parse(row.data)); }
  getTrades(strategyKey = 'default') { return this.db.prepare('SELECT data FROM paper_trades WHERE strategy_key = ? ORDER BY exit_time, trade_id').all(strategyKey).map(row => JSON.parse(row.data)); }
  getDecisions(strategyKey = 'default') { return this.db.prepare('SELECT data FROM strategy_decisions WHERE strategy_key = ? ORDER BY open_time, decision_key').all(strategyKey).map(row => JSON.parse(row.data)); }
  close() { this.db.close(); }
}

module.exports = StrategyRepository;
