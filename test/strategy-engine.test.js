const assert = require('node:assert/strict');
const test = require('node:test');
const StrategyEngine = require('../services/strategy/strategy-engine');

function serviceStub() {
  let listener;
  const candles = [];
  return {
    subscribeCandles(callback) { listener = callback; return () => { listener = null; }; },
    aggregateCandles() { return candles.slice(); },
    push(candle) { candles.push(candle); if (listener) listener(candle); }
  };
}

function strategy(overrides = {}) {
  return {
    name: 'test', version: 1, enabled: true, instruments: ['btcusdt'], aggregation: '1m', indicators: [],
    positionEntry: { left: 'price.close', operator: '>', right: 100 },
    positionExit: { left: 'price.close', operator: '<', right: 90 },
    ...overrides
  };
}

function candle(openTime, close, closed = true) {
  return { instrument: 'btcusdt', openTime, closeTime: openTime + 59999, open: String(close), high: String(close), low: String(close), close: String(close), volume: '10', quoteVolume: '100', trades: 1, candlestickIsClosed: closed };
}

test('evaluates completed aggregates and emits explainable decisions', () => {
  const service = serviceStub();
  const engine = new StrategyEngine({ strategy: strategy(), service });
  const decisions = [];
  engine.on('decision', decision => decisions.push(decision));
  engine.start();
  service.push(candle(1, 110));
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].action, 'ENTER');
  assert.equal(decisions[0].positionEntry.result, true);
  engine.stop();
});

test('ignores incomplete and duplicate candle events', () => {
  const service = serviceStub();
  const engine = new StrategyEngine({ strategy: strategy(), service });
  let count = 0;
  engine.on('decision', () => { count += 1; });
  engine.start();
  service.push(candle(1, 110, false));
  service.push(candle(1, 110));
  service.push(candle(1, 110));
  assert.equal(count, 1);
});

test('uses current position to select exit action', () => {
  const service = serviceStub();
  const engine = new StrategyEngine({ strategy: strategy(), service, getPosition: () => ({ exists: true, side: 'long', size: 1 }) });
  let decision;
  engine.on('decision', value => { decision = value; });
  engine.start();
  service.push(candle(1, 80));
  assert.equal(decision.action, 'EXIT');
});

test('seeds aggregate subscription after backfill without reprocessing the latest candle', () => {
  const candles = [candle(1, 110)];
  let callback;
  let options;
  const service = {
    subscribeCandles() { return () => {}; },
    aggregateCandles() { return candles.slice(); },
    subscribeAggregatedCandles(_symbol, _aggregation, suppliedOptions, listener) {
      options = suppliedOptions;
      callback = listener;
      return () => { callback = null; };
    }
  };
  const engine = new StrategyEngine({ strategy: strategy(), service });
  let count = 0;
  engine.on('decision', () => { count += 1; });
  engine.start();
  assert.equal(options.lastOpenTime, 1);
  callback({ candle: candle(2, 110) });
  assert.equal(count, 1);
});
