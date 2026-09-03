function validatePeriod(period) {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error('Indicator period must be a positive integer');
  }
}

function closeValue(candle) {
  if (!candle || candle.close === null || candle.close === undefined || candle.close === '') return null;
  const value = Number(candle && candle.close);
  return Number.isFinite(value) ? value : null;
}

function point(candle, value) {
  return {
    openTime: candle.openTime,
    value
  };
}

function calculateSma(candles, period) {
  validatePeriod(period);
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');

  return candles.map((candle, index) => {
    if (index < period - 1) return point(candle, null);
    const values = candles.slice(index - period + 1, index + 1).map(closeValue);
    if (values.some(value => value === null)) return point(candle, null);
    return point(candle, values.reduce((sum, value) => sum + value, 0) / period);
  });
}

function calculateEma(candles, period) {
  validatePeriod(period);
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');

  const points = candles.map(candle => point(candle, null));
  const alpha = 2 / (period + 1);
  let previousEma = null;

  for (let index = period - 1; index < candles.length; index += 1) {
    const values = candles.slice(index - period + 1, index + 1).map(closeValue);
    if (values.some(value => value === null)) {
      previousEma = null;
      continue;
    }

    const close = values[values.length - 1];
    previousEma = previousEma === null
      ? values.reduce((sum, value) => sum + value, 0) / period
      : close * alpha + previousEma * (1 - alpha);
    points[index].value = previousEma;
  }

  return points;
}

function calculateRsi(candles, period) {
  validatePeriod(period);
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');
  const points = candles.map(candle => point(candle, null));
  if (candles.length <= period) return points;

  const closes = candles.map(closeValue);
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    if (closes[index] === null || closes[index - 1] === null) return points;
    const change = closes[index] - closes[index - 1];
    if (change >= 0) averageGain += change / period;
    else averageLoss -= change / period;
  }

  const valueFor = () => {
    if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
    return 100 - (100 / (1 + averageGain / averageLoss));
  };
  points[period].value = valueFor();
  for (let index = period + 1; index < candles.length; index += 1) {
    if (closes[index] === null || closes[index - 1] === null) {
      averageGain = 0;
      averageLoss = 0;
      continue;
    }
    const change = closes[index] - closes[index - 1];
    averageGain = (averageGain * (period - 1) + (change > 0 ? change : 0)) / period;
    averageLoss = (averageLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
    points[index].value = valueFor();
  }
  return points;
}

function calculateAtr(candles, period) {
  validatePeriod(period);
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');
  const points = candles.map(candle => point(candle, null));
  const trueRanges = candles.map((candle, index) => {
    const high = Number(candle && candle.high);
    const low = Number(candle && candle.low);
    const previousClose = index === 0 ? null : closeValue(candles[index - 1]);
    if (!Number.isFinite(high) || !Number.isFinite(low) || (index > 0 && previousClose === null)) return null;
    return index === 0
      ? high - low
      : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  });
  if (trueRanges.slice(0, period).some(value => value === null)) return points;

  let atr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  points[period - 1].value = atr;
  for (let index = period; index < candles.length; index += 1) {
    if (trueRanges[index] === null) continue;
    atr = (atr * (period - 1) + trueRanges[index]) / period;
    points[index].value = atr;
  }
  return points;
}

function calculateVwap(candles) {
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');
  const points = candles.map(candle => point(candle, null));
  let session = null;
  let cumulativeVolume = 0;
  let cumulativePriceVolume = 0;

  candles.forEach((candle, index) => {
    const high = Number(candle && candle.high);
    const low = Number(candle && candle.low);
    const close = closeValue(candle);
    const volume = Number(candle && candle.volume);
    const openTime = Number(candle && candle.openTime);
    if (!Number.isFinite(high) || !Number.isFinite(low) || close === null || !Number.isFinite(volume) || !Number.isFinite(openTime)) return;

    const candleSession = Math.floor(openTime / 86400000);
    if (session !== candleSession) {
      session = candleSession;
      cumulativeVolume = 0;
      cumulativePriceVolume = 0;
    }
    cumulativeVolume += volume;
    cumulativePriceVolume += ((high + low + close) / 3) * volume;
    points[index].value = cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null;
  });
  return points;
}

function calculateStochastic(candles, kPeriod, dPeriod, slowing) {
  validatePeriod(kPeriod);
  validatePeriod(dPeriod);
  validatePeriod(slowing);
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');
  const points = candles.map(candle => point(candle, null));
  const rawK = candles.map((candle, index) => {
    if (index < kPeriod - 1) return null;
    const window = candles.slice(index - kPeriod + 1, index + 1);
    const highs = window.map(item => Number(item.high));
    const lows = window.map(item => Number(item.low));
    const close = closeValue(candle);
    if (highs.some(value => !Number.isFinite(value)) || lows.some(value => !Number.isFinite(value)) || close === null) return null;
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    return highest === lowest ? 50 : ((close - lowest) / (highest - lowest)) * 100;
  });
  const slowedK = rawK.map((_, index) => {
    if (index < kPeriod + slowing - 2) return null;
    const values = rawK.slice(index - slowing + 1, index + 1);
    return values.some(value => value === null) ? null : values.reduce((sum, value) => sum + value, 0) / slowing;
  });
  const dValues = slowedK.map((_, index) => {
    if (index < kPeriod + slowing + dPeriod - 3) return null;
    const values = slowedK.slice(index - dPeriod + 1, index + 1);
    return values.some(value => value === null) ? null : values.reduce((sum, value) => sum + value, 0) / dPeriod;
  });
  return {
    k: points.map((item, index) => ({ ...item, value: slowedK[index] })),
    d: points.map((item, index) => ({ ...item, value: dValues[index] }))
  };
}

function calculateAdx(candles, period) {
  validatePeriod(period);
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');
  const points = candles.map(candle => point(candle, null));
  const plusDi = candles.map(candle => point(candle, null));
  const minusDi = candles.map(candle => point(candle, null));
  const trueRanges = Array(candles.length).fill(null);
  const plusDm = Array(candles.length).fill(null);
  const minusDm = Array(candles.length).fill(null);

  for (let index = 1; index < candles.length; index += 1) {
    const high = Number(candles[index].high);
    const low = Number(candles[index].low);
    const previousHigh = Number(candles[index - 1].high);
    const previousLow = Number(candles[index - 1].low);
    const previousClose = closeValue(candles[index - 1]);
    if (![high, low, previousHigh, previousLow].every(Number.isFinite) || previousClose === null) continue;
    trueRanges[index] = Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
    const upwardMove = high - previousHigh;
    const downwardMove = previousLow - low;
    plusDm[index] = upwardMove > downwardMove && upwardMove > 0 ? upwardMove : 0;
    minusDm[index] = downwardMove > upwardMove && downwardMove > 0 ? downwardMove : 0;
  }

  if (candles.length <= period * 2 - 1 || trueRanges.slice(1, period + 1).some(value => value === null)) {
    return { adx: points, plusDi, minusDi };
  }
  let smoothedTr = trueRanges.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedPlusDm = plusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedMinusDm = minusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  const dx = Array(candles.length).fill(null);
  const setDirectionalValues = index => {
    plusDi[index].value = smoothedTr === 0 ? 0 : (100 * smoothedPlusDm) / smoothedTr;
    minusDi[index].value = smoothedTr === 0 ? 0 : (100 * smoothedMinusDm) / smoothedTr;
    const denominator = plusDi[index].value + minusDi[index].value;
    dx[index] = denominator === 0 ? 0 : (100 * Math.abs(plusDi[index].value - minusDi[index].value)) / denominator;
  };
  setDirectionalValues(period);
  for (let index = period + 1; index < candles.length; index += 1) {
    if (trueRanges[index] === null || plusDm[index] === null || minusDm[index] === null) continue;
    smoothedTr = smoothedTr - smoothedTr / period + trueRanges[index];
    smoothedPlusDm = smoothedPlusDm - smoothedPlusDm / period + plusDm[index];
    smoothedMinusDm = smoothedMinusDm - smoothedMinusDm / period + minusDm[index];
    setDirectionalValues(index);
  }

  const firstAdxIndex = period * 2 - 1;
  const initialDx = dx.slice(period, firstAdxIndex + 1);
  if (initialDx.some(value => value === null)) return { adx: points, plusDi, minusDi };
  let adx = initialDx.reduce((sum, value) => sum + value, 0) / period;
  points[firstAdxIndex].value = adx;
  for (let index = firstAdxIndex + 1; index < candles.length; index += 1) {
    if (dx[index] === null) continue;
    adx = (adx * (period - 1) + dx[index]) / period;
    points[index].value = adx;
  }
  return { adx: points, plusDi, minusDi };
}

function calculateMacd(candles, fastPeriod, slowPeriod, signalPeriod) {
  validatePeriod(fastPeriod);
  validatePeriod(slowPeriod);
  validatePeriod(signalPeriod);
  if (fastPeriod >= slowPeriod) throw new Error('MACD fast period must be less than slow period');
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');

  const fast = calculateEma(candles, fastPeriod);
  const slow = calculateEma(candles, slowPeriod);
  const macd = candles.map((candle, index) => point(candle,
    fast[index].value === null || slow[index].value === null ? null : fast[index].value - slow[index].value));
  const signalInput = macd.map(item => ({ openTime: item.openTime, close: item.value }));
  const signal = calculateEma(signalInput, signalPeriod);
  return {
    macd,
    signal,
    histogram: candles.map((candle, index) => point(candle,
      macd[index].value === null || signal[index].value === null ? null : macd[index].value - signal[index].value))
  };
}

function volumeValue(candle) {
  const value = Number(candle && candle.volume);
  return Number.isFinite(value) ? value : null;
}

function calculateVolumeSma(candles, period) {
  return calculateSma(candles.map(candle => ({ ...candle, close: volumeValue(candle) })), period);
}

function calculateVolumeEma(candles, period) {
  return calculateEma(candles.map(candle => ({ ...candle, close: volumeValue(candle) })), period);
}

function tradeCountValue(candle) {
  const value = Number(candle && candle.trades);
  return Number.isFinite(value) ? value : null;
}

function tradeCountCandles(candles) {
  return candles.map(candle => ({ ...candle, close: tradeCountValue(candle) }));
}

function calculateTradeCount(candles) { return candles.map(candle => point(candle, tradeCountValue(candle))); }
function calculateTradeCountSma(candles, period) { return calculateSma(tradeCountCandles(candles), period); }
function calculateTradeCountEma(candles, period) { return calculateEma(tradeCountCandles(candles), period); }

function calculateVwma(candles, period) {
  validatePeriod(period);
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');
  return candles.map((candle, index) => {
    if (index < period - 1) return point(candle, null);
    const window = candles.slice(index - period + 1, index + 1);
    const entries = window.map(item => ({ price: closeValue(item), volume: volumeValue(item) }));
    if (entries.some(entry => entry.price === null || entry.volume === null)) return point(candle, null);
    const totalVolume = entries.reduce((sum, entry) => sum + entry.volume, 0);
    if (totalVolume === 0) return point(candle, null);
    const priceVolume = entries.reduce((sum, entry) => sum + entry.price * entry.volume, 0);
    return point(candle, priceVolume / totalVolume);
  });
}

function calculateBollingerBands(candles, period, standardDeviations) {
  validatePeriod(period);
  if (!Number.isFinite(standardDeviations) || standardDeviations < 0) {
    throw new Error('Bollinger standard deviations must be a non-negative number');
  }
  if (!Array.isArray(candles)) throw new Error('Candles must be an array');
  const middle = candles.map(candle => point(candle, null));
  const upper = candles.map(candle => point(candle, null));
  const lower = candles.map(candle => point(candle, null));
  candles.forEach((candle, index) => {
    if (index < period - 1) return;
    const values = candles.slice(index - period + 1, index + 1).map(closeValue);
    if (values.some(value => value === null)) return;
    const average = values.reduce((sum, value) => sum + value, 0) / period;
    const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / period;
    const deviation = Math.sqrt(variance) * standardDeviations;
    middle[index].value = average;
    upper[index].value = average + deviation;
    lower[index].value = average - deviation;
  });
  return { middle, upper, lower };
}

module.exports = {
  calculateSma, calculateEma, calculateRsi, calculateAtr, calculateVwap,
  calculateStochastic, calculateAdx, calculateMacd, calculateVolumeSma,
  calculateVolumeEma, calculateVwma, calculateBollingerBands
  , calculateTradeCount, calculateTradeCountSma, calculateTradeCountEma
};
