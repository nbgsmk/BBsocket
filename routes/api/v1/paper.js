const express = require('express');

function limitValue(value) {
  if (value === undefined) return 100;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return null;
  return Math.min(limit, 1000);
}

module.exports = function createPaperRoutes(runtime) {
  const router = express.Router();
  router.get('/positions', (req, res) => {
    let positions = runtime.runtimes.flatMap(item => item.broker ? item.broker.getPositions().map(position => ({ ...position, strategy: item.strategy.name, version: item.strategy.version })) : []);
    if (req.query.strategy) positions = positions.filter(position => position.strategy === String(req.query.strategy));
    if (req.query.instrument) positions = positions.filter(position => position.instrument === String(req.query.instrument).toLowerCase());
    res.json(positions);
  });
  router.get('/trades', (req, res) => {
    const limit = limitValue(req.query.limit);
    if (limit === null) return res.status(400).json({ error: 'limit must be a positive integer' });
    let trades = runtime.runtimes.flatMap(item => item.broker ? item.broker.getTrades().map(trade => ({ ...trade, strategy: item.strategy.name, version: item.strategy.version })) : []);
    if (req.query.strategy) trades = trades.filter(trade => trade.strategy === String(req.query.strategy));
    if (req.query.instrument) trades = trades.filter(trade => trade.instrument === String(req.query.instrument).toLowerCase());
    res.json(trades.slice(-limit));
  });
  return router;
};
