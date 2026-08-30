const express = require('express');
const createBinanceRoutes = require('./binance');
const createCandleRoutes = require('./candles');

module.exports = function createApiV1Routes(service) {
  const router = express.Router();
  router.use('/binance', createBinanceRoutes(service));
  router.use('/binance/candles', createCandleRoutes(service));
  return router;
};
