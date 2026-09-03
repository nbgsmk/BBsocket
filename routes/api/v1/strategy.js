const express = require('express');

function limitValue(value) {
  if (value === undefined) return 100;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return null;
  return Math.min(limit, 1000);
}

module.exports = function createStrategyRoutes(runtime) {
  const router = express.Router();
  router.get('/status', (req, res) => {
    return res.json({ strategies: runtime.runtimes.map(item => ({ file: item.file, enabled: Boolean(item.strategy.enabled && item.engine), name: item.strategy.name, version: item.strategy.version, marketType: item.service && item.service.marketType || null, instrument: item.strategy.instruments[0], aggregation: item.strategy.aggregation, indicators: item.strategy.indicators, lastDecisionTime: item.engine && item.engine.decisions.length ? item.engine.decisions[item.engine.decisions.length - 1].openTime : null })), errors: runtime.errors || [] });
  });
  router.get('/decisions', (req, res) => {
    const limit = limitValue(req.query.limit);
    if (limit === null) return res.status(400).json({ error: 'limit must be a positive integer' });
    let decisions = runtime.runtimes.flatMap(item => item.engine ? item.engine.getDecisions() : []);
    if (req.query.strategy) decisions = decisions.filter(decision => decision.strategy === String(req.query.strategy));
    if (req.query.instrument) decisions = decisions.filter(decision => decision.instrument === String(req.query.instrument).toLowerCase());
    decisions.sort((left, right) => left.openTime - right.openTime || String(left.strategy).localeCompare(String(right.strategy)));
    res.json(decisions.slice(-limit));
  });
  return router;
};
