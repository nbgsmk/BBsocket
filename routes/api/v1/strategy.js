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
    const strategy = runtime.strategy;
    return res.json({ enabled: Boolean(strategy && strategy.enabled && runtime.engine), name: strategy && strategy.name || null, version: strategy && strategy.version || null, instruments: strategy && strategy.instruments || [], aggregation: strategy && strategy.aggregation || null, lastDecisionTime: runtime.engine && runtime.engine.decisions.length ? runtime.engine.decisions[runtime.engine.decisions.length - 1].openTime : null });
  });
  router.get('/decisions', (req, res) => {
    const limit = limitValue(req.query.limit);
    if (limit === null) return res.status(400).json({ error: 'limit must be a positive integer' });
    let decisions = runtime.engine ? runtime.engine.getDecisions() : [];
    if (req.query.instrument) decisions = decisions.filter(decision => decision.instrument === String(req.query.instrument).toLowerCase());
    res.json(decisions.slice(-limit));
  });
  return router;
};
