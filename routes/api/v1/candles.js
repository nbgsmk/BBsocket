const express = require('express');

module.exports = function createCandleRoutes(service) {
  const router = express.Router();
  router.get('/:symbol', (req, res) => {
    const requested = req.params.symbol.toLowerCase();
    const configured = service.status().tickerSymbols.map(symbol => symbol.split('_')[0].toLowerCase());
    if (!configured.includes(requested)) return res.status(404).json({ error: 'Symbol is not configured' });
    const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) return res.status(400).json({ error: 'limit must be a positive integer' });
    try {
      const includeIncomplete = req.query.includeIncomplete === 'true';
      const result = req.query.aggregation
        ? service.aggregateCandles(requested, req.query.aggregation, includeIncomplete)
        : service.candles(requested, limit);
      res.json(Number.isInteger(limit) && limit > 0 ? result.slice(-limit) : result);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.get('/:symbol/live', (req, res) => {
    const requested = req.params.symbol.toLowerCase();
    const configured = service.status().tickerSymbols.map(symbol => symbol.split('_')[0].toLowerCase());
    const aggregation = req.query.aggregation;
    const includeIncomplete = req.query.includeIncomplete !== 'false';
    if (!configured.includes(requested)) return res.status(404).json({ error: 'Symbol is not configured' });
    if (!aggregation) return res.status(400).json({ error: 'aggregation is required' });
    try { service.aggregateCandles(requested, aggregation, includeIncomplete); } catch (error) { return res.status(400).json({ error: error.message }); }
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
      res.write('data: ' + JSON.stringify(candle) + '\n\n');
    };
    if (includeIncomplete) send();
    const unsubscribe = service.subscribeCandles(candle => {
      if (candle.symbol === requested) send();
    });
    req.on('close', unsubscribe);
  });
  return router;
};
