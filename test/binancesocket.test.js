const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { BinanceSocket } = require('../services/exchanges/binance/service');
const ExchangeService = require('../services/exchanges/exchange-service');

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
    coinM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSD_PERPETUAL', 'ETHUSD_PERPETUAL'], historyCandles: 1000, exchangeCandlestickStreamInterval: '1m', initiallyConnected: false },
    usdM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSDT', 'ETHUSDT'], historyCandles: 1000, exchangeCandlestickStreamInterval: '1m', initiallyConnected: false },
    ...overrides
  }));
  return { directory, configPath };
}

test('builds the Coin-M continuous stream URL', () => {
  const { configPath, directory } = tempConfig({ coinM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSD_PERPETUAL', 'ETHUSD_PERPETUAL'], historyCandles: 1000, exchangeCandlestickStreamInterval: '5m', initiallyConnected: false } });
  const service = new BinanceSocket({ configPath, marketType: 'coin-m' });
  assert.equal(service.streamUrl(), 'wss://dstream.binance.com/stream?streams=btcusd_perpetual@continuousKline_5m/ethusd_perpetual@continuousKline_5m');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('builds the USD-M stream URL and accepts USD-M symbols', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath, marketType: 'usd-m' });
  assert.equal(service.streamUrl(), 'wss://dstream.binance.com/stream?streams=btcusdt@kline_1m/ethusdt@kline_1m');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('normalizes the configured host to lowercase', () => {
  const { configPath, directory } = tempConfig({ usdM: { host: 'DSTREAM.BINANCE.COM', tickerSymbols: ['BTCUSDT'], historyCandles: 1000, exchangeCandlestickStreamInterval: '1m', initiallyConnected: false } });
  const service = new BinanceSocket({ configPath, marketType: 'usd-m' });
  assert.equal(service.config.host, 'dstream.binance.com');
  assert.match(service.streamUrl(), /^wss:\/\/dstream\.binance\.com\//);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('implements the common exchange service interface', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  assert.ok(service instanceof ExchangeService);
  for (const method of ['connect', 'disconnect', 'status', 'candles', 'subscribe']) {
    assert.equal(typeof service[method], 'function');
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

test('stores only closed candles and replaces duplicate candles', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  const now = Date.now();
  service.handleMessage(JSON.stringify({ k: { t: 1, x: false } }));
  service.handleMessage(closedMessage(now));
  service.handleMessage(closedMessage(now).replace('"101"', '"103"'));
  assert.equal(service.candles('btcusd_perpetual').length, 1);
  assert.equal(service.candles('btcusd_perpetual')[0].close, '103');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('keeps histories separate for combined-stream symbols', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  const message = JSON.parse(closedMessage(Date.now()));
  message.k.s = 'ETHUSD_PERPETUAL';
  service.handleMessage(JSON.stringify({ stream: 'ethusd_perpetual@continuousKline_1m', data: message }));
  assert.equal(service.candles('btcusd_perpetual').length, 0);
  assert.equal(service.candles('ethusd_perpetual').length, 1);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('retains no more than the configured number of candles', () => {
  const { configPath, directory } = tempConfig({ coinM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSD_PERPETUAL', 'ETHUSD_PERPETUAL'], historyCandles: 2, exchangeCandlestickStreamInterval: '1m', initiallyConnected: false } });
  const service = new BinanceSocket({ configPath });
  const now = Date.now();
  service.handleMessage(closedMessage(now));
  service.handleMessage(closedMessage(now + 60000));
  service.handleMessage(closedMessage(now + 120000));
  assert.equal(service.candles('btcusd_perpetual').length, 2);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('aggregates complete 1m candles into aligned intervals', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  const bucket = Math.floor(Date.now() / 300000) * 300000 - 300000;
  for (let index = 0; index < 5; index += 1) {
    const candle = JSON.parse(closedMessage(bucket + index * 60000));
    candle.k.o = String(100 + index);
    candle.k.h = String(105 + index);
    candle.k.l = String(95 - index);
    candle.k.c = String(101 + index);
    service.handleMessage(JSON.stringify(candle));
  }
  const result = service.aggregateCandles('btcusd_perpetual', '5m');
  assert.equal(result.length, 1);
  assert.equal(result[0].open, '100');
  assert.equal(result[0].close, '105');
  assert.equal(result[0].high, '109');
  assert.equal(result[0].low, '91');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('accepts the custom 2m, 10m, and 20m aggregation intervals', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  assert.doesNotThrow(() => service.aggregateCandles('btcusd_perpetual', '2m'));
  assert.doesNotThrow(() => service.aggregateCandles('btcusd_perpetual', '10m'));
  assert.doesNotThrow(() => service.aggregateCandles('btcusd_perpetual', '20m'));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('accepts the custom 2d, 4d, and 5d aggregation intervals', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  assert.doesNotThrow(() => service.aggregateCandles('btcusd_perpetual', '2d'));
  assert.doesNotThrow(() => service.aggregateCandles('btcusd_perpetual', '4d'));
  assert.doesNotThrow(() => service.aggregateCandles('btcusd_perpetual', '5d'));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('keeps an open source candle out of history but includes it in live aggregation', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  const open = JSON.parse(closedMessage(Date.now()));
  open.k.x = false;
  service.handleMessage(JSON.stringify(open));
  assert.equal(service.candles('btcusd').length, 0);
  const result = service.aggregateCandles('btcusd_perpetual', '5m', true);
  assert.equal(result.length, 1);
  assert.equal(result[0].candlestickIsClosed, false);
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
  assert.equal(JSON.parse(fs.readFileSync(configPath)).coinM.initiallyConnected, true);
  service.disconnect();
  assert.equal(JSON.parse(fs.readFileSync(configPath)).coinM.initiallyConnected, false);
  fs.rmSync(directory, { recursive: true, force: true });
});
