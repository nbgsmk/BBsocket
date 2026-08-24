const express = require('express');

module.exports = function createCandleRoutes(service) {
  const router = express.Router();

  router.get('/:symbol', (req, res) => {
    const requested = req.params.symbol.toLowerCase();
    const configured = service.status().tickerSymbol.split('_')[0].toLowerCase();
    if (requested !== configured) {
      return res.status(404).json({ error: 'Symbol is not configured' });
    }
    const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }
    res.json(service.candles(limit));
  });

  return router;
};
