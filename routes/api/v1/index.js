const express = require('express');
const createBinanceRoutes = require('./binance');
const createCandleRoutes = require('./candles');
const createStrategyRoutes = require('./strategy');
const createPaperRoutes = require('./paper');

module.exports = function createApiV1Routes(services) {
  const router = express.Router();
  router.use('/binance/coin-m', createBinanceRoutes(services.coinM));
  router.use('/binance/coin-m/candles', createCandleRoutes(services.coinM));
  router.use('/binance/usd-m', createBinanceRoutes(services.usdM));
  router.use('/binance/usd-m/candles', createCandleRoutes(services.usdM));
  if (services.strategy) {
    router.use('/strategy', createStrategyRoutes(services.strategy));
    router.use('/paper', createPaperRoutes(services.strategy));
  }
  return router;
};
