const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { BinanceSocket } = require('../services/binancesocket');

const closedMessage = (openTime, closeTime = openTime + 59999) => JSON.stringify({
  e: 'continuous_kline', k: {
    t: openTime, T: closeTime, s: 'BTCUSD_PERPETUAL', i: '1m',
    o: '100', c: '101', h: '102', l: '99', v: '10', q: '1000', n: 4, x: true
  }
});

function tempConfig(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'binancesocket-'));
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    tickerSymbol: 'BTCUSD_PERPETUAL', historyCandles: 1000, candleInterval: '1m', connected: false, ...overrides
  }));
  return { directory, configPath };
}

test('builds the Coin-M continuous stream URL', () => {
  const { configPath, directory } = tempConfig({ candleInterval: '5m' });
  const service = new BinanceSocket({ configPath });
  assert.equal(service.streamUrl(), 'wss://dstream.binance.com/ws/btcusd_perpetual@continuousKline_5m');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('stores only closed candles and replaces duplicate candles', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  const now = Date.now();
  service.handleMessage(JSON.stringify({ k: { t: 1, x: false } }));
  service.handleMessage(closedMessage(now));
  service.handleMessage(closedMessage(now).replace('"101"', '"103"'));
  assert.equal(service.candles().length, 1);
  assert.equal(service.candles()[0].close, '103');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('retains no more than the configured number of candles', () => {
  const { configPath, directory } = tempConfig({ historyCandles: 2 });
  const service = new BinanceSocket({ configPath });
  const now = Date.now();
  service.handleMessage(closedMessage(now));
  service.handleMessage(closedMessage(now + 60000));
  service.handleMessage(closedMessage(now + 120000));
  assert.equal(service.candles().length, 2);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('persists connection state and stops reconnecting after disconnect', () => {
  const { configPath, directory } = tempConfig();
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    constructor() { this.readyState = FakeWebSocket.OPEN; this.handlers = {}; }
    on(event, handler) { this.handlers[event] = handler; }
    close() { this.readyState = 3; if (this.handlers.close) this.handlers.close(); }
  }
  const service = new BinanceSocket({ configPath, WebSocket: FakeWebSocket });
  service.connect();
  assert.equal(JSON.parse(fs.readFileSync(configPath)).connected, true);
  service.disconnect();
  assert.equal(JSON.parse(fs.readFileSync(configPath)).connected, false);
  fs.rmSync(directory, { recursive: true, force: true });
});
