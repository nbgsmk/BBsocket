const express = require('express');

module.exports = function createCandleRoutes(service) {
  const router = express.Router();

  router.get('/:symbol', (req, res) => {
    const requested = req.params.symbol.toLowerCase();
    const configured = service.status().tickerSymbols.map(symbol => symbol.split('_')[0].toLowerCase());
    if (!configured.includes(requested)) {
      return res.status(404).json({ error: 'Symbol is not configured' });
    }
    const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }
    try {
      const result = req.query.aggregation
        ? service.aggregateCandles(requested, req.query.aggregation)
        : service.candles(requested);
      res.json(Number.isInteger(limit) && limit > 0 ? result.slice(-limit) : result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
};
