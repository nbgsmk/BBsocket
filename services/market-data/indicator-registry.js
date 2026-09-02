const { calculateSma, calculateEma, calculateRsi, calculateAtr, calculateVwap, calculateStochastic, calculateAdx, calculateMacd, calculateVolumeSma, calculateVolumeEma, calculateVwma, calculateBollingerBands } = require('./indicators');

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
  },
  bollinger: {
    parameterNames: ['period', 'standardDeviations'],
    outputSeries: ['middle', 'upper', 'lower'],
    calculate: (candles, parameters) => calculateBollingerBands(candles, parameters.period, parameters.standardDeviations)
  },
  volumeSma: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateVolumeSma(candles, period) })
  },
  volumeEma: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateVolumeEma(candles, period) })
  },
  vwma: {
    outputSeries: ['value'],
    calculate: (candles, { period }) => ({ value: calculateVwma(candles, period) })
  }
});

function parseIndicatorSpecifications(value) {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') throw new Error('indicators must be a comma-separated list');

  return value.split(',').map(specification => {
    const parts = specification.trim().toLowerCase().split(':');
    const type = Object.keys(indicatorRegistry).find(name => name.toLowerCase() === parts[0]);
    const definition = type ? indicatorRegistry[type] : undefined;
    const parameterNames = definition ? (definition.parameterNames || ['period']) : [];
    if (!definition || parts.length !== parameterNames.length + 1) {
      throw new Error('Each indicator must use the format type:period, for example sma:20');
    }
    const parameters = {};
    parameterNames.forEach((name, index) => {
      if (!/^\d+(?:\.\d+)?$/.test(parts[index + 1])) {
        throw new Error('Each indicator must use the format type:period, for example sma:20');
      }
      parameters[name] = Number(parts[index + 1]);
      if (name.toLowerCase().includes('period') && (!Number.isInteger(parameters[name]) || parameters[name] < 1)) {
        throw new Error('Indicator period must be a positive integer');
      }
      if (!name.toLowerCase().includes('period') && parameters[name] < 0) {
        throw new Error('Indicator parameter must be non-negative');
      }
    });
    return { type, parameters };
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
