const express = require('express');

function limitValue(value) {
  if (value === undefined) return 100;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return null;
  return Math.min(limit, 1000);
}

module.exports = function createStrategyRoutes(runtime) {
  const router = express.Router();
  router.post('/reload', (req, res) => {
    try {
      const result = runtime.reloadStrategy(req.body && req.body.file);
      return res.json({
        file: result.file,
        name: result.strategy.name,
        version: result.strategy.version,
        enabled: Boolean(result.strategy.enabled && result.engine)
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });
  router.get('/status', (req, res) => {
    return res.json({ strategies: runtime.runtimes.map(item => ({ file: item.file, enabled: Boolean(item.strategy.enabled && item.engine), name: item.strategy.name, version: item.strategy.version, marketType: item.service && item.service.marketType || null, instrument: item.strategy.instruments[0], aggregation: item.strategy.aggregation, indicators: item.strategy.indicators, lastDecisionTime: item.engine && item.engine.decisions.length ? item.engine.decisions[item.engine.decisions.length - 1].openTime : null })), errors: runtime.errors || [] });
  });
  router.get('/decisions', (req, res) => {
    const limit = limitValue(req.query.limit);
    if (limit === null) return res.status(400).json({ error: 'limit must be a positive integer' });
    let decisions = runtime.runtimes.flatMap(item => {
      if (!item.engine) return [];
      const live = item.engine.getDecisions();
      return req.query.history === 'true' && typeof item.engine.getHistoricalDecisions === 'function'
        ? live.concat(item.engine.getHistoricalDecisions(1000))
        : live;
    });
    if (req.query.strategy) decisions = decisions.filter(decision => decision.strategy === String(req.query.strategy));
    if (req.query.instrument) decisions = decisions.filter(decision => decision.instrument === String(req.query.instrument).toLowerCase());
    decisions.sort((left, right) => left.openTime - right.openTime || String(left.strategy).localeCompare(String(right.strategy)));
    const unique = new Map();
    decisions.forEach(decision => unique.set(String(decision.strategy) + ':' + decision.openTime + ':' + decision.action, decision));
    res.json(Array.from(unique.values()).slice(-limit));
  });
  return router;
};
