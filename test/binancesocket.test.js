const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');
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
  const configPath = path.join(directory, 'config.yaml');
  fs.writeFileSync(configPath, YAML.stringify({
    coinM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSD_PERPETUAL', 'ETHUSD_PERPETUAL'], maxCandlesInMemory: 1000, initialCandlesInMemory: 1000, exchangeCandlestickStreamInterval: '1m', fetchHistoricalCandlesOnStart: false, connectOnStart: false },
    usdM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSDT', 'ETHUSDT'], maxCandlesInMemory: 1000, initialCandlesInMemory: 1000, exchangeCandlestickStreamInterval: '1m', fetchHistoricalCandlesOnStart: false, connectOnStart: false },
    ...overrides
  }));
  return { directory, configPath };
}

test('builds the Coin-M continuous stream URL', () => {
  const { configPath, directory } = tempConfig({ coinM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSD_PERPETUAL', 'ETHUSD_PERPETUAL'], maxCandlesInMemory: 1000, exchangeCandlestickStreamInterval: '5m', connectOnStart: false } });
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
  const { configPath, directory } = tempConfig({ usdM: { host: 'DSTREAM.BINANCE.COM', tickerSymbols: ['btcusdt'], maxCandlesInMemory: 1000, exchangeCandlestickStreamInterval: '1m', connectOnStart: false } });
  const service = new BinanceSocket({ configPath, marketType: 'usd-m' });
  assert.equal(service.config.host, 'dstream.binance.com');
  assert.match(service.streamUrl(), /^wss:\/\/dstream\.binance\.com\//);
  assert.deepEqual(service.config.tickerSymbols, ['BTCUSDT']);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('accepts case-insensitive string connection states', () => {
  const { configPath, directory } = tempConfig({ usdM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSDT'], maxCandlesInMemory: 1000, exchangeCandlestickStreamInterval: '1m', connectOnStart: 'FALSE' } });
  const service = new BinanceSocket({ configPath, marketType: 'usd-m' });
  assert.equal(service.config.connectOnStart, false);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('accepts case-insensitive historical candle startup states', () => {
  const { configPath, directory } = tempConfig({ usdM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSDT'], maxCandlesInMemory: 1000, exchangeCandlestickStreamInterval: '1m', fetchHistoricalCandlesOnStart: 'TRUE', connectOnStart: false } });
  const service = new BinanceSocket({ configPath, marketType: 'usd-m' });
  assert.equal(service.config.fetchHistoricalCandlesOnStart, true);
  assert.equal(service.status().fetchHistoricalCandlesOnStart, true);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('defaults and caps the initial historical candle count', () => {
  const defaultConfig = tempConfig({ usdM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSDT'], maxCandlesInMemory: 7, exchangeCandlestickStreamInterval: '1m', connectOnStart: false } });
  const defaultService = new BinanceSocket({ configPath: defaultConfig.configPath, marketType: 'usd-m' });
  assert.equal(defaultService.config.initialCandlesInMemory, 7);
  fs.rmSync(defaultConfig.directory, { recursive: true, force: true });

  const cappedConfig = tempConfig({ usdM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSDT'], maxCandlesInMemory: 7, initialCandlesInMemory: 20, exchangeCandlestickStreamInterval: '1m', connectOnStart: false } });
  const cappedService = new BinanceSocket({ configPath: cappedConfig.configPath, marketType: 'usd-m' });
  assert.equal(cappedService.config.initialCandlesInMemory, 7);
  assert.equal(cappedService.status().initialCandlesInMemory, 7);
  fs.rmSync(cappedConfig.directory, { recursive: true, force: true });
});

test('rejects invalid initial historical candle counts', () => {
  for (const value of [0, -1, 1.5, 'seven']) {
    const { configPath, directory } = tempConfig({ usdM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSDT'], maxCandlesInMemory: 7, initialCandlesInMemory: value, exchangeCandlestickStreamInterval: '1m', connectOnStart: false } });
    assert.throws(() => new BinanceSocket({ configPath, marketType: 'usd-m' }), /initialCandlesInMemory must be a positive integer/);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('uses the effective initial count for historical backfill requests', async () => {
  const { configPath, directory } = tempConfig({ usdM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSDT'], maxCandlesInMemory: 5, initialCandlesInMemory: 2, exchangeCandlestickStreamInterval: '1m', connectOnStart: false } });
  const requests = [];
  const rows = [
    [1, '100', '101', '99', '100', '1', 59999, '100', 1],
    [60001, '100', '101', '99', '100', '1', 119999, '100', 1]
  ];
  const service = new BinanceSocket({
    configPath,
    marketType: 'usd-m',
    fetch: async url => {
      requests.push(url);
      return { ok: true, json: async () => requests.length === 1 ? rows : [] };
    }
  });
  await service.fetchHistoryForSymbol('BTCUSDT');
  assert.match(requests[0], /[?&]limit=2(?:&|$)/);
  assert.equal(service.candles('btcusdt').length, 2);
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
  const { configPath, directory } = tempConfig({ coinM: { host: 'dstream.binance.com', tickerSymbols: ['BTCUSD_PERPETUAL', 'ETHUSD_PERPETUAL'], maxCandlesInMemory: 2, exchangeCandlestickStreamInterval: '1m', connectOnStart: false } });
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

test('publishes each completed aggregate once and ignores backfill events when requested', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  const events = [];
  const unsubscribe = service.subscribeAggregatedCandles('btcusd_perpetual', '1m', { includeIncomplete: false, onBackfill: 'ignore' }, event => events.push(event));
  const first = JSON.parse(closedMessage(1_700_000_000_000));
  service.history.update({ instrument: 'btcusd_perpetual', openTime: 1_700_000_000_000, closeTime: 1_700_000_059_999, open: '100', high: '101', low: '99', close: '100', volume: '1', quoteVolume: '100', trades: 1, candlestickIsClosed: true }, 'backfill');
  assert.equal(events.length, 0);
  service.handleMessage(JSON.stringify(first));
  assert.equal(events.length, 1);
  service.handleMessage(JSON.stringify(first));
  assert.equal(events.length, 1);
  unsubscribe();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('can seed the last completed aggregate timestamp for a live subscriber', () => {
  const { configPath, directory } = tempConfig();
  const service = new BinanceSocket({ configPath });
  const openTime = 1_700_000_000_000;
  const candle = { instrument: 'btcusd_perpetual', openTime, closeTime: openTime + 59999, open: '100', high: '101', low: '99', close: '100', volume: '1', quoteVolume: '100', trades: 1, candlestickIsClosed: true };
  service.history.update(candle);
  const events = [];
  const unsubscribe = service.subscribeAggregatedCandles('btcusd_perpetual', '1m', { includeIncomplete: false, lastOpenTime: openTime }, event => events.push(event));
  service.history.update({ ...candle, close: '102' });
  assert.equal(events.length, 0);
  service.history.update({ ...candle, openTime: openTime + 60000, closeTime: openTime + 119999 });
  assert.equal(events.length, 1);
  unsubscribe();
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
  assert.equal(YAML.parse(fs.readFileSync(configPath, 'utf8')).coinM.connectOnStart, true);
  service.disconnect();
  assert.equal(YAML.parse(fs.readFileSync(configPath, 'utf8')).coinM.connectOnStart, false);
  fs.rmSync(directory, { recursive: true, force: true });
});
