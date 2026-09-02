const assert = require('node:assert/strict');
const test = require('node:test');
const PaperBroker = require('../services/strategy/paper-broker');

const candle = (time, close) => ({ openTime: time, close: String(close) });

test('opens and closes a long position with realized PnL', () => {
  const broker = new PaperBroker();
  const opened = broker.execute({ action: 'ENTER', instrument: 'btcusdt', trade: { side: 'long', size: 2 } }, candle(1, 100));
  assert.equal(opened.status, 'opened');
  assert.equal(broker.getPosition('btcusdt', 105).unrealizedPnl, 10);
  const closed = broker.execute({ action: 'EXIT', instrument: 'btcusdt' }, candle(2, 105));
  assert.equal(closed.status, 'closed');
  assert.equal(closed.trade.realizedPnl, 10);
  assert.equal(broker.getTrades().length, 1);
});

test('calculates short PnL and protects invalid transitions', () => {
  const broker = new PaperBroker();
  broker.execute({ action: 'ENTER', instrument: 'ethusdt', trade: { side: 'short', size: 1 } }, candle(1, 200));
  assert.equal(broker.execute({ action: 'ENTER', instrument: 'ethusdt', trade: { side: 'short', size: 1 } }, candle(2, 190)).status, 'ignored');
  const closed = broker.execute({ action: 'EXIT', instrument: 'ethusdt' }, candle(3, 180));
  assert.equal(closed.trade.realizedPnl, 20);
  assert.equal(broker.execute({ action: 'EXIT', instrument: 'ethusdt' }, candle(4, 170)).status, 'ignored');
});
