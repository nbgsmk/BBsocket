const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const StrategyRepository = require('../services/strategy/sqlite-repository');

test('persists positions, trades, and decisions across repository instances', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-db-'));
  const filePath = path.join(directory, 'strategy.sqlite');
  const first = new StrategyRepository(filePath);
  first.savePosition({ instrument: 'btcusdt', exists: true, side: 'long', size: 1, entryPrice: 100, entryTime: 1, unrealizedPnl: 0 });
  first.saveTrade({ tradeId: 'paper-1', instrument: 'btcusdt', side: 'long', size: 1, entryPrice: 100, exitPrice: 105, entryTime: 1, exitTime: 2, realizedPnl: 5 });
  first.saveDecision({ decisionKey: 'test:1:btcusdt:1m:1', openTime: 1, instrument: 'btcusdt', action: 'ENTER' });
  first.close();
  const second = new StrategyRepository(filePath);
  assert.equal(second.getPositions().length, 1);
  assert.equal(second.getTrades()[0].realizedPnl, 5);
  assert.equal(second.getDecisions()[0].decisionKey, 'test:1:btcusdt:1m:1');
  second.deletePosition('btcusdt');
  assert.equal(second.getPositions().length, 0);
  second.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('ignores duplicate decision keys', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-db-'));
  const repository = new StrategyRepository(path.join(directory, 'strategy.sqlite'));
  const decision = { decisionKey: 'same', openTime: 1, instrument: 'btcusdt', action: 'HOLD' };
  repository.saveDecision(decision);
  repository.saveDecision({ ...decision, action: 'ENTER' });
  assert.equal(repository.getDecisions().length, 1);
  assert.equal(repository.getDecisions()[0].action, 'HOLD');
  repository.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
