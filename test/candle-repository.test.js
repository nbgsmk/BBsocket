const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const CandleRepository = require('../services/market-data/candle-repository');

test('persists and restores candles per instrument with retention', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'candle-data-'));
  const filePath = path.join(directory, 'candles.sqlite');
  const repository = new CandleRepository(filePath);
  repository.save({ instrument: 'btcusdt', openTime: 1, close: '1', candlestickIsClosed: true });
  repository.save({ instrument: 'btcusdt', openTime: 2, close: '2', candlestickIsClosed: true });
  repository.save({ instrument: 'ethusdt', openTime: 1, close: '3', candlestickIsClosed: true });
  repository.trim('btcusdt', 1);
  assert.deepEqual(repository.getCandles(['btcusdt', 'ethusdt'], 10).map(candle => candle.close), ['2', '3']);
  repository.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
