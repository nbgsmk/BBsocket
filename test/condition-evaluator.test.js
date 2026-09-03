const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateCondition, resolveReference } = require('../services/strategy/condition-evaluator');

const context = {
  price: { close: 105 },
  volume: { volume: 200 },
  indicator: { 'sma:20': 100, 'sma:50': 95, 'macd:12:26:9': { macd: 2, signal: 1 } },
  previous: { price: { close: 95 }, indicator: { 'sma:20': 94, 'sma:50': 95, 'macd:12:26:9': { macd: 0, signal: 1 } } },
  position: { exists: false, side: null }
};

test('resolves price, indicator, series, and position references', () => {
  assert.equal(resolveReference('price.close', context), 105);
  assert.equal(resolveReference('indicator.macd:12:26:9.signal', context), 1);
  assert.equal(resolveReference('previous.indicator.sma:20', context), 94);
  assert.equal(resolveReference('position.exists', context), false);
});

test('evaluates comparisons and between inclusively', () => {
  assert.equal(evaluateCondition({ left: 'price.close', operator: '>', right: 100 }, context).result, true);
  assert.equal(evaluateCondition({ left: 'volume.volume', operator: '>=', right: 'indicator.sma:20' }, context).result, true);
  assert.equal(evaluateCondition({ left: 'price.close', operator: 'between', value: [105, 110] }, context).result, true);
  assert.equal(evaluateCondition({ left: 'position.exists', operator: '=', right: false }, context).result, true);
});

test('evaluates compact condition-key aliases', () => {
  const evaluation = evaluateCondition({ l: 'price.close', op: '>', r: 100 }, context);
  assert.equal(evaluation.result, true);
  assert.equal(evaluation.left, 105);
  assert.equal(evaluation.right, 100);
  assert.equal(evaluation.operator, '>');
});

test('rejects duplicate canonical keys and aliases', () => {
  assert.throws(() => evaluateCondition({ left: 'price.close', l: 'price.high', operator: '>', right: 100 }), /both left and l/);
});

test('evaluates crossovers using previous values', () => {
  const condition = { left: 'indicator.sma:20', operator: 'crossesAbove', right: 'indicator.sma:50' };
  const evaluation = evaluateCondition(condition, context);
  assert.equal(evaluation.result, true);
  assert.equal(evaluation.previousLeft, 94);
});

test('evaluates nested logical groups and explains results', () => {
  const evaluation = evaluateCondition({ matchAny: [
    { left: 'price.close', operator: '<', right: 10 },
    { not: { left: 'position.exists', operator: '=', right: true } }
  ] }, context);
  assert.equal(evaluation.result, true);
  assert.equal(evaluation.type, 'matchAny');
  assert.equal(evaluation.evaluations.length, 2);
});

test('treats missing values as non-matches', () => {
  assert.equal(evaluateCondition({ left: 'indicator.rsi:14', operator: '>', right: 50 }, context).result, false);
});
