const assert = require('node:assert/strict');
const test = require('node:test');
const createStrategyRoutes = require('../routes/api/v1/strategy');
const createPaperRoutes = require('../routes/api/v1/paper');

function call(router, url, query = {}) {
  return new Promise((resolve, reject) => {
    const req = { method: 'GET', url, originalUrl: url, query };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ statusCode: this.statusCode, body }); }
    };
    router.handle(req, res, error => error ? reject(error) : reject(new Error('Route not found')));
  });
}

function runtime() {
  const decision = (strategy, openTime) => ({ strategy, version: 1, instrument: 'btcusdt', openTime, action: 'HOLD' });
  return {
    runtimes: [
      { file: 'a.yaml', strategy: { name: 'trend', version: 1, enabled: true, instruments: ['btcusdt'], aggregation: '1m', indicators: [] }, service: { marketType: 'usd-m' }, engine: { decisions: [decision('trend', 20)], getDecisions: () => [decision('trend', 20)] }, broker: { getPositions: () => [{ instrument: 'btcusdt' }], getTrades: () => [] } },
      { file: 'b.yaml', strategy: { name: 'rsi', version: 2, enabled: false, instruments: ['ethusdt'], aggregation: '5m', indicators: ['rsi:14'] }, service: { marketType: 'usd-m' }, engine: null, broker: null }
    ],
    errors: [{ file: 'bad.yaml', error: 'Invalid strategy' }]
  };
}

test('returns all strategy statuses and startup errors', async () => {
  const response = await call(createStrategyRoutes(runtime()), '/status');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.strategies.length, 2);
  assert.equal(response.body.strategies[0].marketType, 'usd-m');
  assert.equal(response.body.strategies[1].enabled, false);
  assert.equal(response.body.errors[0].file, 'bad.yaml');
});

test('filters decisions by strategy and instrument', async () => {
  const fixture = runtime();
  fixture.runtimes[0].engine.getDecisions = () => [
    { strategy: 'trend', version: 1, instrument: 'btcusdt', openTime: 20, action: 'HOLD' },
    { strategy: 'trend', version: 1, instrument: 'ethusdt', openTime: 10, action: 'HOLD' }
  ];
  const response = await call(createStrategyRoutes(fixture), '/decisions', { strategy: 'trend', instrument: 'btcusdt', limit: '1' });
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].instrument, 'btcusdt');
});

test('filters paper positions and trades by strategy', async () => {
  const response = await call(createPaperRoutes(runtime()), '/positions', { strategy: 'trend' });
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].strategy, 'trend');
});
