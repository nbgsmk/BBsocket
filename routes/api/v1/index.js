const express = require('express');
const createBinanceRoutes = require('./binance');
const createCandleRoutes = require('./candles');

module.exports = function createApiV1Routes(services) {
  const router = express.Router();
  router.use('/binance/coin-m', createBinanceRoutes(services.coinM));
  router.use('/binance/coin-m/candles', createCandleRoutes(services.coinM));
  router.use('/binance/usd-m', createBinanceRoutes(services.usdM));
  router.use('/binance/usd-m/candles', createCandleRoutes(services.usdM));
  return router;
};
