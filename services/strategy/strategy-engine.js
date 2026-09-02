const EventEmitter = require('node:events');
const { parseIndicatorSpecifications, calculateIndicators } = require('../market-data/indicator-registry');
const { evaluateCondition } = require('./condition-evaluator');

function indicatorKey(specification, seriesName, multiple) {
  return multiple ? specification + '.' + seriesName : specification;
}

class StrategyEngine extends EventEmitter {
  constructor({ strategy, service, broker, getPosition }) {
    super();
    if (!strategy || !service || typeof service.subscribeCandles !== 'function') throw new Error('Strategy engine requires a strategy and candle service');
    this.strategy = strategy;
    this.service = service;
    this.broker = broker;
    this.getPosition = getPosition || (broker ? ((instrument, price) => broker.getPosition(instrument, price)) : (() => ({ exists: false, side: null, size: 0 })));
    this.specifications = parseIndicatorSpecifications(strategy.indicators.join(','));
    this.lastProcessed = new Set();
    this.unsubscribe = null;
  }

  start() {
    if (!this.unsubscribe) this.unsubscribe = this.service.subscribeCandles(candle => this.handleCandle(candle));
    return this;
  }

  stop() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  }

  handleCandle(candle) {
    if (!this.strategy.enabled) return;
    if (!candle || !candle.candlestickIsClosed) return;
    const instrument = String(candle.instrument || candle.symbol || '').toLowerCase();
    if (!this.strategy.instruments.includes(instrument)) return;
    const aggregates = this.service.aggregateCandles(instrument, this.strategy.aggregation, false);
    if (!aggregates.length) return;
    const currentCandle = aggregates[aggregates.length - 1];
    if (!currentCandle.candlestickIsClosed) return;
    const key = this.strategy.name + ':' + this.strategy.version + ':' + instrument + ':' + this.strategy.aggregation + ':' + currentCandle.openTime;
    if (this.lastProcessed.has(key)) return;
    this.lastProcessed.add(key);
    const indicatorResults = calculateIndicators(aggregates, this.specifications);
    const currentIndex = aggregates.length - 1;
    const previousIndex = currentIndex - 1;
    const indicator = {};
    const previousIndicator = {};
    indicatorResults.forEach((result, resultIndex) => {
      const specification = this.strategy.indicators[resultIndex];
      const multiple = result.series.length > 1;
      result.series.forEach(series => {
        indicator[indicatorKey(specification, series.name, multiple)] = series.values[currentIndex] && series.values[currentIndex].value;
        previousIndicator[indicatorKey(specification, series.name, multiple)] = previousIndex >= 0 && series.values[previousIndex] && series.values[previousIndex].value;
      });
    });
    const context = {
      price: currentCandle,
      volume: currentCandle,
      indicator,
      previous: { price: previousIndex >= 0 ? aggregates[previousIndex] : {}, indicator: previousIndicator },
      position: this.getPosition(instrument, currentCandle.close) || { exists: false, side: null, size: 0 }
    };
    const position = context.position;
    const entryEvaluation = evaluateCondition(this.strategy.entry, context);
    const exitEvaluation = evaluateCondition(this.strategy.exit, context);
    const action = position.exists ? (exitEvaluation.result ? 'EXIT' : 'HOLD') : (entryEvaluation.result ? 'ENTER' : 'HOLD');
    const decision = {
      strategy: this.strategy.name,
      version: this.strategy.version,
      instrument,
      aggregation: this.strategy.aggregation,
      openTime: currentCandle.openTime,
      action,
      candle: currentCandle,
      position,
      trade: this.strategy.trade,
      entry: entryEvaluation,
      exit: exitEvaluation
    };
    if (this.broker) decision.execution = this.broker.execute(decision, currentCandle);
    this.emit('decision', decision);
    return decision;
  }
}

module.exports = StrategyEngine;
