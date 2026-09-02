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

module.exports = { calculateSma, calculateEma };
