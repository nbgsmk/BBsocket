const express = require('express');
const { parseIndicatorSpecifications, calculateIndicators } = require('../../../services/market-data/indicator-registry');

module.exports = function createCandleRoutes(service) {
  const router = express.Router();
  router.get('/snapshot', (req, res) => {
    const requested = String(req.query.instrument || '').toLowerCase();
    const configured = service.status().tickerSymbols.map(symbol => symbol.toLowerCase());
    if (!configured.includes(requested)) return res.status(404).json({ error: 'Symbol is not configured' });
    const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) return res.status(400).json({ error: 'limit must be a positive integer' });
    try {
      const includeIncomplete = req.query.includeIncomplete === 'true';
      const indicators = parseIndicatorSpecifications(req.query.indicators);
      const result = req.query.aggregation
        ? service.aggregateCandles(requested, req.query.aggregation, includeIncomplete)
        : service.candles(requested, limit);
      if (!indicators.length) {
        return res.json(Number.isInteger(limit) && limit > 0 ? result.slice(-limit) : result);
      }

      const aggregation = req.query.aggregation || service.status().exchangeCandlestickStreamInterval;
      const indicatorValues = calculateIndicators(result, indicators);
      const candles = Number.isInteger(limit) && limit > 0 ? result.slice(-limit) : result;
      const limitedIndicators = indicatorValues.map(indicator => ({
        ...indicator,
        series: indicator.series.map(series => ({
          ...series,
          values: Number.isInteger(limit) && limit > 0 ? series.values.slice(-limit) : series.values
        }))
      }));
      return res.json({
        instrument: requested,
        aggregation,
        candles,
        indicators: limitedIndicators
      });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.get('/live', (req, res) => {
    const requested = String(req.query.instrument || '').toLowerCase();
    const configured = service.status().tickerSymbols.map(symbol => symbol.toLowerCase());
    const aggregation = req.query.aggregation;
    const includeIncomplete = req.query.includeIncomplete !== 'false';
    let indicators;
    if (!configured.includes(requested)) return res.status(404).json({ error: 'Symbol is not configured' });
    if (!aggregation) return res.status(400).json({ error: 'aggregation is required' });
    try {
      indicators = parseIndicatorSpecifications(req.query.indicators);
      service.aggregateCandles(requested, aggregation, includeIncomplete);
    } catch (error) { return res.status(400).json({ error: error.message }); }
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.flushHeaders();
    res.write(': connected\n\n');
    let lastCompletedOpenTime = null;
    if (!includeIncomplete) {
      const existing = service.aggregateCandles(requested, aggregation, false);
      if (existing.length) lastCompletedOpenTime = existing[existing.length - 1].openTime;
    }
    const send = () => {
      const candles = service.aggregateCandles(requested, aggregation, includeIncomplete);
      if (!candles.length) return;
      const candle = candles[candles.length - 1];
      if (!includeIncomplete) {
        if (!candle.candlestickIsClosed || candle.openTime === lastCompletedOpenTime) return;
        lastCompletedOpenTime = candle.openTime;
      }
      const indicatorValues = calculateIndicators(candles, indicators).map(indicator => ({
        type: indicator.type,
        parameters: indicator.parameters,
        series: indicator.series.map(series => ({
          name: series.name,
          value: series.values[series.values.length - 1].value
        }))
      }));
      res.write('data: ' + JSON.stringify({
        eventType: 'candlestickUpdate',
        exchange: 'binance',
        marketType: service.marketType || service.status().marketType,
        instrument: requested,
        aggregation,
        openTime: candle.openTime,
        closeTime: candle.closeTime,
        candlestickIsClosed: candle.candlestickIsClosed,
        candlestick: candle,
        indicators: indicatorValues
      }) + '\n\n');
    };
    if (includeIncomplete) send();
    const unsubscribe = service.subscribeCandles(candle => {
      if (candle.instrument === requested) send();
    });
    req.on('close', unsubscribe);
  });
  return router;
};
