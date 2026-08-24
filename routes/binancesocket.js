const express = require('express');

module.exports = function createBinanceRoutes(service) {
  const router = express.Router();

  const connect = (req, res, next) => {
    try { service.connect(); res.json(service.status()); } catch (error) { next(error); }
  };

  const disconnect = (req, res, next) => {
    try { service.disconnect(); res.json(service.status()); } catch (error) { next(error); }
  };

  router.post('/connect', connect);
  router.get('/connect', connect);
  router.post('/disconnect', disconnect);
  router.get('/disconnect', disconnect);

  router.get('/status', (req, res) => res.json(service.status()));

  router.get('/live', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.flushHeaders();
    res.write(': connected\n\n');

    const unsubscribe = service.subscribe(message => {
      res.write('data: ' + message.raw.replace(/\r?\n/g, '') + '\n\n');
    });
    req.on('close', unsubscribe);
  });

  return router;
};
