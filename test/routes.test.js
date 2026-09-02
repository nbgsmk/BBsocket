const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const supertest = require('supertest');
const test = require('node:test');
const createApiV1Routes = require('../routes/api/v1');

function createTestApp(service) {
  const app = express();
  app.use('/api/v1', createApiV1Routes({ coinM: service, usdM: service }));
  return app;
}

function serviceStub() {
  return {
    config: { connected: false },
    candles: (symbol, limit) => limit ? [{ symbol, close: '101' }] : [{ symbol, close: '100' }, { symbol, close: '101' }],
    status: () => ({ connected: false, socketOpen: false, tickerSymbols: ['BTCUSD_PERPETUAL', 'ETHUSD_PERPETUAL'], exchangeCandlestickStreamInterval: '1m', maxCandlesticksInMemory: 1000, candles: { btcusd: 1, ethusd: 1 } }),
    connect() {}, disconnect() {}, subscribe() { return () => {}; }
  };
}

test('returns status and configured candles with limit validation', async () => {
  const response = await supertest(createTestApp(serviceStub())).get('/api/v1/binance/coin-m/status').expect(200);
  assert.deepEqual(response.body.tickerSymbols, ['BTCUSD_PERPETUAL', 'ETHUSD_PERPETUAL']);
  await supertest(createTestApp(serviceStub())).get('/api/v1/binance/usd-m/status').expect(200);
  await supertest(createTestApp(serviceStub())).get('/api/v1/binance/coin-m/candles/snapshot?instrument=btcusd_perpetual&limit=1').expect(200).then(result => {
    assert.equal(result.body.length, 1);
  });
  await supertest(createTestApp(serviceStub())).get('/api/v1/binance/coin-m/candles/snapshot?instrument=btcusd_perpetual&limit=nope').expect(400);
  await supertest(createTestApp(serviceStub())).get('/api/v1/binance/coin-m/candles/snapshot?instrument=ltcusd_perpetual').expect(404);
  await supertest(createTestApp(serviceStub())).get('/api/v1/binance/coin-m/candles/btcusd').expect(404);
});

test('exposes an SSE live endpoint and forwards socket messages', async () => {
  let listener;
  const service = serviceStub();
  service.subscribe = callback => { listener = callback; return () => {}; };
  const request = supertest(createTestApp(service)).get('/api/v1/binance/coin-m/live');
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
  assert.match(template, /id="market-type"/);
  assert.match(template, /id="indicator-period"/);
  assert.match(template, /new URLSearchParams/);
  assert.match(template, /api\/v1\/binance\/'.*marketType\.value/);
  assert.match(template, /JSON\.stringify\(entry\.parsed\)/);
});
