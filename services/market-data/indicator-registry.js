const { calculateSma, calculateEma } = require('./indicators');

const indicatorRegistry = Object.freeze({
  sma: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateSma(candles, period) })
  },
  ema: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateEma(candles, period) })
  }
});

function parseIndicatorSpecifications(value) {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') throw new Error('indicators must be a comma-separated list');

  return value.split(',').map(specification => {
    const parts = specification.trim().toLowerCase().split(':');
    if (parts.length !== 2 || !indicatorRegistry[parts[0]] || !/^\d+$/.test(parts[1])) {
      throw new Error('Each indicator must use the format type:period, for example sma:20');
    }
    const period = Number(parts[1]);
    if (!Number.isInteger(period) || period < 1) throw new Error('Indicator period must be a positive integer');
    return { type: parts[0], parameters: { period } };
  });
}

function calculateIndicators(candles, specifications) {
  return specifications.map(({ type, parameters }) => {
    const definition = indicatorRegistry[type];
    const calculated = definition.calculate(candles, parameters);
    return {
      type,
      parameters,
      series: definition.outputSeries.map(name => ({ name, values: calculated[name] }))
    };
  });
}

module.exports = { indicatorRegistry, parseIndicatorSpecifications, calculateIndicators };
