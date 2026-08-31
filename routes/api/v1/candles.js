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
    if (!configured.includes(requested)) return res.status(404).json({ error: 'Symbol is not configured' });
    if (!aggregation) return res.status(400).json({ error: 'aggregation is required' });
    try { service.aggregateCandles(requested, aggregation, true); } catch (error) { return res.status(400).json({ error: error.message }); }
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.flushHeaders();
    res.write(': connected\n\n');
    const send = () => {
      const candles = service.aggregateCandles(requested, aggregation, true);
      if (candles.length) res.write('data: ' + JSON.stringify(candles[candles.length - 1]) + '\n\n');
    };
    send();
    const unsubscribe = service.subscribeCandles(candle => {
      if (candle.symbol === requested) send();
    });
    req.on('close', unsubscribe);
  });
  return router;
};
