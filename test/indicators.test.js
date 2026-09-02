const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateSma, calculateEma } = require('../services/market-data/indicators');
const { parseIndicatorSpecifications, calculateIndicators } = require('../services/market-data/indicator-registry');

function candles(closes) {
  return closes.map((close, index) => ({ openTime: index * 60000, close: String(close) }));
}

test('calculates SMA points and preserves candle timestamps', () => {
  const result = calculateSma(candles([10, 20, 30, 40]), 3);
  assert.deepEqual(result.map(point => point.openTime), [0, 60000, 120000, 180000]);
  assert.deepEqual(result.map(point => point.value), [null, null, 20, 30]);
});

test('calculates EMA using the first SMA as the seed', () => {
  const result = calculateEma(candles([10, 20, 30, 40, 50]), 3);
  assert.deepEqual(result.slice(0, 2).map(point => point.value), [null, null]);
  assert.deepEqual(result.slice(2).map(point => point.value), [20, 30, 40]);
});

test('returns null until enough valid closing prices are available', () => {
  const input = candles([10, 20, 30]);
  input[1].close = 'not-a-number';
  assert.deepEqual(calculateSma(input, 2).map(point => point.value), [null, null, null]);
  assert.deepEqual(calculateEma(input, 2).map(point => point.value), [null, null, null]);
});

test('rejects invalid indicator periods and candle collections', () => {
  assert.throws(() => calculateSma([], 0), /positive integer/);
  assert.throws(() => calculateEma([], 1.5), /positive integer/);
  assert.throws(() => calculateSma(null, 2), /Candles must be an array/);
});

test('parses multiple indicator specifications and calculates aligned series', () => {
  const specifications = parseIndicatorSpecifications('SMA:2, ema:3');
  assert.deepEqual(specifications, [{ type: 'sma', parameters: { period: 2 } }, { type: 'ema', parameters: { period: 3 } }]);
  const result = calculateIndicators(candles([10, 20, 30]), specifications);
  assert.deepEqual(result.map(indicator => [indicator.type, indicator.parameters.period]), [['sma', 2], ['ema', 3]]);
  assert.deepEqual(result[0].series[0].values.map(point => point.value), [null, 15, 25]);
  assert.deepEqual(result[1].series[0].values.map(point => point.openTime), [0, 60000, 120000]);
});

test('rejects malformed indicator specifications', () => {
  assert.throws(() => parseIndicatorSpecifications('sma'), /type:period/);
  assert.throws(() => parseIndicatorSpecifications('rsi:14'), /type:period/);
  assert.throws(() => parseIndicatorSpecifications('ema:0'), /positive integer/);
});
