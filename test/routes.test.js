const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const supertest = require('supertest');
const test = require('node:test');
const createBinanceRoutes = require('../routes/binancesocket');
const createCandleRoutes = require('../routes/candles');

function createTestApp(service) {
  const app = express();
  app.use('/binancesocket', createBinanceRoutes(service));
  app.use('/', createCandleRoutes(service));
  return app;
}

function serviceStub() {
  return {
    config: { connected: false },
    candles: limit => limit ? [{ close: '101' }] : [{ close: '100' }, { close: '101' }],
    status: () => ({ connected: false, socketOpen: false, tickerSymbol: 'BTCUSD_PERPETUAL', subscriptionInterval: '1m', historyCandles: 1000, candles: 2 }),
    connect() {}, disconnect() {}, subscribe() { return () => {}; }
  };
}

test('returns status and configured candles with limit validation', async () => {
  const response = await supertest(createTestApp(serviceStub())).get('/binancesocket/status').expect(200);
  assert.equal(response.body.tickerSymbol, 'BTCUSD_PERPETUAL');
  await supertest(createTestApp(serviceStub())).get('/btcusd?limit=1').expect(200).then(result => {
    assert.equal(result.body.length, 1);
  });
  await supertest(createTestApp(serviceStub())).get('/btcusd?limit=nope').expect(400);
  await supertest(createTestApp(serviceStub())).get('/ethusd').expect(404);
});

test('exposes an SSE live endpoint and forwards socket messages', async () => {
  let listener;
  const service = serviceStub();
  service.subscribe = callback => { listener = callback; return () => {}; };
  const request = supertest(createTestApp(service)).get('/binancesocket/live');
  const result = await new Promise((resolve, reject) => {
    request.buffer(true).parse((response, callback) => {
      response.on('data', chunk => {
        if (chunk.toString().includes(': connected')) {
          listener({ raw: '{"event":"test"}' });
          response.destroy();
        }
      });
      response.on('close', () => callback(null, Buffer.from('')));
    }).end((error, response) => error ? reject(error) : resolve(response));
  });
  assert.equal(result.status, 200);
});

test('dashboard template contains controls and formatting toggle', () => {
  const template = fs.readFileSync(require.resolve('../views/dashboard.ejs'), 'utf8');
  assert.match(template, /id="live-toggle"/);
  assert.match(template, /id="format-toggle"/);
  assert.match(template, /JSON\.stringify\(entry\.parsed\)/);
});
