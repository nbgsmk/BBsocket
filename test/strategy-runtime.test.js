const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createStrategyRuntimes } = require('../services/strategy/runtime');

const valid = (name, instrument, enabled = true) => `
name: ${name}
version: 1
enabled: ${enabled}
instruments: [${instrument}]
aggregation: 1m
indicators: []
positionEntry: { left: price.close, operator: ">", right: 100 }
positionExit: { left: price.close, operator: "<", right: 90 }
`;

function service() {
  return {
    config: { tickerSymbols: ['BTCUSDT', 'ETHUSDT'] },
    aggregateCandles: () => [],
    subscribeCandles: () => () => {},
    subscribeAggregatedCandles: () => () => {}
  };
}

test('loads each strategy file independently and reports invalid files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strategies-'));
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-data-'));
  fs.writeFileSync(path.join(directory, 'btc.yaml'), valid('btc-trend', 'btcusdt'));
  fs.writeFileSync(path.join(directory, 'disabled.yaml'), valid('disabled', 'ethusdt', false));
  fs.writeFileSync(path.join(directory, 'invalid.yaml'), 'name: incomplete\n');

  const runtime = createStrategyRuntimes({ strategiesDirectory: directory, services: { usdM: service() }, dataPath: path.join(dataDirectory, 'strategy.sqlite') });
  assert.equal(runtime.runtimes.length, 2);
  assert.equal(runtime.errors.length, 1);
  assert.equal(runtime.errors[0].file, 'invalid.yaml');
  assert.equal(runtime.runtimes.find(item => item.strategy.name === 'btc-trend').engine !== null, true);
  assert.equal(runtime.runtimes.find(item => item.strategy.name === 'disabled').engine, null);
  runtime.runtimes.forEach(item => { if (item.engine) item.engine.stop(); if (item.repository) item.repository.close(); });
  fs.rmSync(directory, { recursive: true, force: true });
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test('rejects a strategy containing multiple instruments', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strategies-'));
  fs.writeFileSync(path.join(directory, 'multi.yaml'), valid('multi', 'btcusdt').replace('[btcusdt]', '[btcusdt, ethusdt]'));
  const runtime = createStrategyRuntimes({ strategiesDirectory: directory, services: { usdM: service() } });
  assert.equal(runtime.runtimes.length, 0);
  assert.match(runtime.errors[0].error, /exactly one instrument/);
  fs.rmSync(directory, { recursive: true, force: true });
});
