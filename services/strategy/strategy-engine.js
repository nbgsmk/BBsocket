const EventEmitter = require('node:events');
const { parseIndicatorSpecifications, calculateIndicators } = require('../market-data/indicator-registry');
const { evaluateCondition } = require('./condition-evaluator');

function indicatorKey(specification, seriesName, multiple) {
  return multiple ? specification + '.' + seriesName : specification;
}

class StrategyEngine extends EventEmitter {
  constructor({ strategy, service, broker, getPosition, repository }) {
    super();
    if (!strategy || !service || typeof service.subscribeCandles !== 'function') throw new Error('Strategy engine requires a strategy and candle service');
    this.strategy = strategy;
    this.strategyKey = strategy.name + ':v' + strategy.version;
    this.service = service;
    this.broker = broker;
    this.repository = repository;
    this.getPosition = getPosition || (broker ? ((instrument, price) => broker.getPosition(instrument, price)) : (() => ({ exists: false, side: null, size: 0 })));
    this.specifications = parseIndicatorSpecifications(strategy.indicators.map(item => item.indicator).join(','));
    this.decisions = repository ? repository.getDecisions(this.strategyKey) : [];
    this.lastProcessed = new Set(this.decisions.map(decision => decision.decisionKey).filter(Boolean));
    this.unsubscribe = null;
  }

  start() {
    if (!this.unsubscribe && typeof this.service.subscribeAggregatedCandles === 'function') {
      const instrument = this.strategy.instruments[0];
      const existing = this.service.aggregateCandles(instrument, this.strategy.aggregation, false);
      const lastOpenTime = existing.length ? existing[existing.length - 1].openTime : null;
      this.unsubscribe = this.service.subscribeAggregatedCandles(instrument, this.strategy.aggregation, { includeIncomplete: false, onBackfill: 'ignore', lastOpenTime }, event => this.handleCandle(event.candle, event));
    } else if (!this.unsubscribe) this.unsubscribe = this.service.subscribeCandles(candle => this.handleCandle(candle));
    return this;
  }

  stop() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  }

  handleCandle(candle, event = {}) {
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
      const configured = this.strategy.indicators[resultIndex];
      const specification = configured.indicator;
      const alias = configured.name;
      const multiple = result.series.length > 1;
      result.series.forEach(series => {
        indicator[alias + (multiple ? '.' + series.name : '')] = series.values[currentIndex] && series.values[currentIndex].value;
        previousIndicator[alias + (multiple ? '.' + series.name : '')] = previousIndex >= 0 && series.values[previousIndex] && series.values[previousIndex].value;
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
    const positionEntryEvaluation = evaluateCondition(this.strategy.positionEntry, context);
    const positionExitEvaluation = evaluateCondition(this.strategy.positionExit, context);
    const action = position.exists ? (positionExitEvaluation.result ? 'EXIT' : 'HOLD') : (positionEntryEvaluation.result ? 'ENTER' : 'HOLD');
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
      positionEntry: positionEntryEvaluation,
      positionExit: positionExitEvaluation
    };
    decision.decisionKey = key;
    if (this.broker) decision.execution = this.broker.execute(decision, currentCandle);
    if (this.repository) this.repository.saveDecision(decision, this.strategyKey);
    this.decisions.push(decision);
    if (this.decisions.length > 1000) this.decisions.shift();
    this.emit('decision', decision);
    return decision;
  }

  getDecisions() { return this.decisions.map(decision => ({ ...decision })); }

  getHistoricalDecisions(limit = 1000) {
    const instrument = this.strategy.instruments[0];
    const candles = this.service.aggregateCandles(instrument, this.strategy.aggregation, false)
      .filter(candle => candle && candle.candlestickIsClosed);
    const results = calculateIndicators(candles, this.specifications);
    const historical = [];
    let inPosition = false;
    for (let index = 1; index < candles.length; index += 1) {
      const indicator = {};
      const previousIndicator = {};
      results.forEach((result, resultIndex) => {
        const configured = this.strategy.indicators[resultIndex];
        const alias = configured.name;
        const multiple = result.series.length > 1;
        result.series.forEach(series => {
          indicator[alias + (multiple ? '.' + series.name : '')] = result.series && series.values[index] && series.values[index].value;
          previousIndicator[alias + (multiple ? '.' + series.name : '')] = series.values[index - 1] && series.values[index - 1].value;
        });
      });
      const candle = candles[index];
      const context = {
        price: candle,
        volume: candle,
        indicator,
        previous: { price: candles[index - 1], indicator: previousIndicator },
        position: { exists: inPosition, side: null, size: 0 }
      };
      const entry = evaluateCondition(this.strategy.positionEntry, context);
      const exit = evaluateCondition(this.strategy.positionExit, context);
      const action = inPosition ? (exit.result ? 'EXIT' : 'HOLD') : (entry.result ? 'ENTER' : 'HOLD');
      if (action === 'ENTER' || action === 'EXIT') {
        historical.push({ strategy: this.strategy.name, version: this.strategy.version, instrument, aggregation: this.strategy.aggregation, openTime: candle.openTime, action, candle, position: context.position, trade: this.strategy.trade, positionEntry: entry, positionExit: exit });
        inPosition = action === 'ENTER';
      }
    }
    return historical.slice(-limit);
  }
}

module.exports = StrategyEngine;
