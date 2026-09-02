const { calculateSma, calculateEma, calculateRsi, calculateAtr, calculateVwap, calculateStochastic, calculateAdx, calculateMacd } = require('./indicators');

const indicatorRegistry = Object.freeze({
  sma: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateSma(candles, period) })
  },
  ema: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateEma(candles, period) })
  },
  rsi: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateRsi(candles, period) })
  },
  atr: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateAtr(candles, period) })
  },
  vwap: {
    parameterNames: [],
    outputSeries: ['value'],
    calculate: candles => ({ value: calculateVwap(candles) })
  },
  stochastic: {
    parameterNames: ['kPeriod', 'dPeriod', 'slowing'],
    outputSeries: ['k', 'd'],
    calculate: (candles, parameters) => calculateStochastic(candles, parameters.kPeriod, parameters.dPeriod, parameters.slowing)
  },
  adx: {
    outputSeries: ['adx', 'plusDi', 'minusDi'],
    calculate: (candles, { period }) => calculateAdx(candles, period)
  },
  macd: {
    parameterNames: ['fastPeriod', 'slowPeriod', 'signalPeriod'],
    outputSeries: ['macd', 'signal', 'histogram'],
    calculate: (candles, parameters) => calculateMacd(candles, parameters.fastPeriod, parameters.slowPeriod, parameters.signalPeriod)
  }
});

function parseIndicatorSpecifications(value) {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') throw new Error('indicators must be a comma-separated list');

  return value.split(',').map(specification => {
    const parts = specification.trim().toLowerCase().split(':');
    const definition = indicatorRegistry[parts[0]];
    const parameterNames = definition ? (definition.parameterNames || ['period']) : [];
    if (!definition || parts.length !== parameterNames.length + 1 || parameterNames.some((_, index) => !/^\d+$/.test(parts[index + 1]))) {
      throw new Error('Each indicator must use the format type:period, for example sma:20');
    }
    const parameters = {};
    parameterNames.forEach((name, index) => { parameters[name] = Number(parts[index + 1]); });
    if (Object.values(parameters).some(period => !Number.isInteger(period) || period < 1)) {
      throw new Error('Indicator period must be a positive integer');
    }
    return { type: parts[0], parameters };
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
