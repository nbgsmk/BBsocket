const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

class CandleRepository {
  constructor(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS candles (
      instrument TEXT NOT NULL,
      open_time INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (instrument, open_time)
    )`);
    this.saveStatement = this.db.prepare('INSERT OR REPLACE INTO candles (instrument, open_time, data) VALUES (?, ?, ?)');
    this.deleteOldStatement = this.db.prepare('DELETE FROM candles WHERE instrument = ? AND open_time NOT IN (SELECT open_time FROM candles WHERE instrument = ? ORDER BY open_time DESC LIMIT ?)');
  }

  getCandles(instruments, limit) {
    const statement = this.db.prepare('SELECT data FROM candles WHERE instrument = ? ORDER BY open_time DESC LIMIT ?');
    return instruments.flatMap(instrument => statement.all(instrument, limit).reverse().map(row => JSON.parse(row.data)));
  }

  save(candle) {
    const instrument = candle.instrument || candle.symbol;
    this.saveStatement.run(instrument, candle.openTime, JSON.stringify(candle));
  }

  trim(instrument, limit) {
    this.deleteOldStatement.run(instrument, instrument, limit);
  }

  close() {
    this.db.close();
  }
}

module.exports = CandleRepository;
