const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateSma, calculateEma, calculateRsi, calculateAtr, calculateVwap, calculateStochastic, calculateAdx, calculateMacd, calculateVolumeSma, calculateVolumeEma, calculateVwma, calculateBollingerBands } = require('../services/market-data/indicators');
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
  assert.throws(() => parseIndicatorSpecifications('macd:14'), /type:period/);
  assert.throws(() => parseIndicatorSpecifications('ema:0'), /positive integer/);
});

test('calculates RSI with Wilder smoothing', () => {
  const result = calculateRsi(candles([1, 2, 3, 2, 1, 4]), 3);
  assert.deepEqual(result.slice(0, 3).map(point => point.value), [null, null, null]);
  assert.equal(result[3].value, 66.66666666666666);
  assert.ok(result[4].value < result[3].value);
});

test('calculates ATR from true ranges with Wilder smoothing', () => {
  const input = [
    { openTime: 0, high: '12', low: '10', close: '11' },
    { openTime: 60000, high: '14', low: '9', close: '13' },
    { openTime: 120000, high: '15', low: '12', close: '14' }
  ];
  const result = calculateAtr(input, 2);
  assert.deepEqual(result.slice(0, 1).map(point => point.value), [null]);
  assert.equal(result[1].value, 3.5);
  assert.equal(result[2].value, 3.25);
});

test('calculates daily UTC-anchored VWAP from typical price and volume', () => {
  const input = [
    { openTime: 0, high: '12', low: '10', close: '11', volume: '2' },
    { openTime: 60000, high: '14', low: '12', close: '13', volume: '1' },
    { openTime: 86400000, high: '22', low: '20', close: '21', volume: '2' }
  ];
  const result = calculateVwap(input);
  assert.deepEqual(result.map(point => point.value), [11, (11 * 2 + 13) / 3, 21]);
});

test('calculates stochastic K and D series', () => {
  const input = [
    { openTime: 0, high: '10', low: '0', close: '5' },
    { openTime: 60000, high: '12', low: '1', close: '11' },
    { openTime: 120000, high: '13', low: '2', close: '12' },
    { openTime: 180000, high: '14', low: '3', close: '13' }
  ];
  const result = calculateStochastic(input, 3, 2, 1);
  assert.equal(result.k[0].value, null);
  assert.equal(result.k[2].value, (12 / 13) * 100);
  assert.equal(result.d[3].value, (result.k[2].value + result.k[3].value) / 2);
});

test('calculates ADX with directional index series', () => {
  const input = [
    { openTime: 0, high: '10', low: '8', close: '9' },
    { openTime: 60000, high: '12', low: '9', close: '11' },
    { openTime: 120000, high: '14', low: '11', close: '13' },
    { openTime: 180000, high: '16', low: '13', close: '15' },
    { openTime: 240000, high: '18', low: '15', close: '17' }
  ];
  const result = calculateAdx(input, 2);
  assert.equal(result.adx[2].value, null);
  assert.equal(result.adx[3].value, 100);
  assert.ok(result.plusDi[3].value > 0);
  assert.equal(result.minusDi[3].value, 0);
});

test('calculates MACD, signal, and histogram series', () => {
  const result = calculateMacd(candles(Array.from({ length: 40 }, (_, index) => index + 1)), 3, 5, 2);
  assert.deepEqual(Object.keys(result), ['macd', 'signal', 'histogram']);
  assert.equal(result.macd[3].value, null);
  assert.notEqual(result.macd[4].value, null);
  assert.equal(result.signal[4].value, null);
  assert.notEqual(result.signal[5].value, null);
  assert.equal(result.histogram[5].value, result.macd[5].value - result.signal[5].value);
});

test('rejects invalid MACD periods', () => {
  assert.throws(() => calculateMacd(candles([1, 2, 3]), 12, 12, 9), /fast period must be less/);
});

test('calculates Bollinger middle, upper, and lower series', () => {
  const result = calculateBollingerBands(candles([10, 12, 14]), 3, 2);
  assert.equal(result.middle[1].value, null);
  assert.equal(result.middle[2].value, 12);
  assert.equal(result.upper[2].value, 12 + (Math.sqrt(8 / 3) * 2));
  assert.equal(result.lower[2].value, 12 - (Math.sqrt(8 / 3) * 2));
});

test('calculates volume SMA and EMA from candle volume', () => {
  const input = candles([10, 20, 30]).map((candle, index) => ({ ...candle, volume: String((index + 1) * 100) }));
  assert.deepEqual(calculateVolumeSma(input, 2).map(point => point.value), [null, 150, 250]);
  assert.deepEqual(calculateVolumeEma(input, 2).map(point => point.value), [null, 150, 250]);
  assert.deepEqual(parseIndicatorSpecifications('VOLUMESMA:2,VOLUMEEMA:2').map(indicator => indicator.type), ['volumeSma', 'volumeEma']);
  assert.deepEqual(parseIndicatorSpecifications('BOLLINGER:20:2.5').map(indicator => indicator.parameters), [{ period: 20, standardDeviations: 2.5 }]);
});

test('calculates rolling VWMA from closing price and volume', () => {
  const input = [
    { openTime: 0, close: '10', volume: '1' },
    { openTime: 60000, close: '20', volume: '3' },
    { openTime: 120000, close: '30', volume: '2' }
  ];
  const result = calculateVwma(input, 2);
  assert.deepEqual(result.map(point => point.value), [null, 17.5, 24]);
});
