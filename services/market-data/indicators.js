function validatePeriod(period) {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error('Indicator period must be a positive integer');
  }
}

function closeValue(candle) {
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

module.exports = { calculateSma, calculateEma, calculateRsi, calculateAtr };
